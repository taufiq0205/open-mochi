import { logger } from "@sentry/core"
import { wrapLanguageModel, type LanguageModelMiddleware } from "ai"
import { AI_RESERVATION, MAX_OUTPUT_TOKENS, aiCost } from "./usage-policy"
import { getUsagePeriod, reserveUsage, settleAI } from "./usage"

export function meteredModel(
  model: Parameters<typeof wrapLanguageModel>[0]["model"],
  userId: string
) {
  const middleware: LanguageModelMiddleware = {
    transformParams: async ({ params }) => ({
      ...params,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    }),
    wrapGenerate: async () => {
      throw new Error("Only metered streaming is supported")
    },
    wrapStream: async ({ doStream }) => {
      const period = await getUsagePeriod(userId)
      const reservation = await reserveUsage(period, "ai", AI_RESERVATION)
      // Unknown/aborted provider calls keep their reservation; never refund an unverified charge.
      const result = await doStream()
      return {
        ...result,
        stream: result.stream.pipeThrough(
          new TransformStream({
            async transform(part, controller) {
              if (part.type === "finish") {
                const input = part.usage.inputTokens.total
                const output = part.usage.outputTokens.total
                if (input !== undefined && output !== undefined) {
                  await settleAI(
                    reservation.id,
                    input,
                    output,
                    aiCost(input, output)
                  )
                  logger.info("AI usage settled", {
                    input_tokens: input,
                    output_tokens: output,
                  })
                }
              }
              controller.enqueue(part)
            },
          })
        ),
      }
    },
  }
  return wrapLanguageModel({ model, middleware })
}
