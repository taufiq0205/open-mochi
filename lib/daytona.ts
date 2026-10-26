import { Daytona } from "@daytona/sdk"

export function getDaytona() {
  return new Daytona({
    apiUrl: process.env.DAYTONA_API_URL ?? process.env.DAYTONA_SERVER_URL,
  })
}
