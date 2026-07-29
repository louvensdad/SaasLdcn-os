FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    npm_config_update_notifier=false \
    npm_config_fund=false \
    npm_config_audit=false

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates cargo composer git golang-go gradle \
        maven nodejs npm openjdk-21-jdk-headless php-cli \
        python3 python3-pip python3-venv tini \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 65532 sandbox \
    && useradd --uid 65532 --gid 65532 --no-create-home --home-dir /tmp --shell /usr/sbin/nologin sandbox

WORKDIR /workspace
USER 65532:65532
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sleep", "infinity"]
