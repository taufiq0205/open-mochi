# Desktop tooling follows OpenSandbox's desktop example, with an ARM64 browser.
FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive DISPLAY=:0 HOME=/home/desktop
RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates python3 xvfb x11-utils x11vnc xfce4 xfce4-terminal \
    dbus-x11 novnc python3-websockify xdotool scrot firefox-esr fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --shell /bin/bash desktop
COPY --chmod=755 start-desktop.sh /usr/local/bin/start-desktop
WORKDIR /home/desktop
USER desktop
CMD ["/usr/local/bin/start-desktop"]
