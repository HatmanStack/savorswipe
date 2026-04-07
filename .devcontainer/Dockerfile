FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

ARG NODE_VERSION=22
ARG PYTHON_VERSION=3.13

ENV DEBIAN_FRONTEND=noninteractive
ENV NVM_DIR=/usr/local/nvm
ENV UV_INSTALL_DIR=/usr/local/bin

# System tooling
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        git \
        gnupg \
        jq \
        ripgrep \
        unzip \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

# Node.js via nvm (pinned to active LTS v22)
RUN mkdir -p ${NVM_DIR} \
    && curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash \
    && . ${NVM_DIR}/nvm.sh \
    && nvm install ${NODE_VERSION} \
    && nvm alias default ${NODE_VERSION} \
    && ln -sf ${NVM_DIR}/versions/node/$(nvm version)/bin/node /usr/local/bin/node \
    && ln -sf ${NVM_DIR}/versions/node/$(nvm version)/bin/npm /usr/local/bin/npm \
    && ln -sf ${NVM_DIR}/versions/node/$(nvm version)/bin/npx /usr/local/bin/npx

# uv (manages Python toolchain — never bare pip)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
    && uv python install ${PYTHON_VERSION}

# AWS SAM CLI is invoked via uvx on demand; pre-warm the cache so first use is fast
RUN uvx --from aws-sam-cli sam --version || true

WORKDIR /workspaces/savorswipe
