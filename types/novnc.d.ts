// noVNC 1.7 exports its client at the package root; DefinitelyTyped still names the old path.
declare module "@novnc/novnc" {
  export { default } from "@novnc/novnc/lib/rfb"
}
