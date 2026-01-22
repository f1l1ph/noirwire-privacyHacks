# 00 — Turborepo Monorepo Structure

## Overview

This blueprint defines the **monorepo structure** for the NoirWire project using **Turborepo** and **Yarn Workspaces**.

The monorepo contains all TypeScript/JavaScript applications, shared packages, Solana Anchor programs, and Noir ZK circuits in a single repository for streamlined development and deployment.

**Key Technologies:**

- **Turborepo**: Build system and task orchestration
- **Yarn Classic (v1.x)**: Package manager (same as eth-scaffold-2)
- **TypeScript**: Primary language for apps and packages
- **Next.js**: Web application framework
- **NestJS**: API backend framework
- **Anchor**: Solana program framework (Rust)
- **Noir**: ZK circuit language

---

## Table of Contents

1. [Monorepo Structure](#1-monorepo-structure)
2. [Package Manager Setup](#2-package-manager-setup)
3. [Turborepo Configuration](#3-turborepo-configuration)
4. [Apps Directory](#4-apps-directory)
5. [Packages Directory](#5-packages-directory)
6. [Scripts Directory](#6-scripts-directory)
7. [Shared Configuration](#7-shared-configuration)
8. [Development Workflow](#8-development-workflow)
9. [Build & Deploy](#9-build--deploy)
10. [Testing Strategy](#10-testing-strategy)

---

## 1. Monorepo Structure

```
noirwire/
├── apps/
│   ├── web/                    # Next.js frontend application
│   ├── api/                    # NestJS API backend
│   ├── indexer/                # NestJS transaction indexer (separate service)
│   └── docs/                   # Documentation site (LOW PRIORITY)
│
├── packages/
│   ├── sdk/                    # @noirwire/sdk - TypeScript SDK
│   ├── types/                  # @noirwire/types - Shared TypeScript types
│   ├── config/                 # @noirwire/config - Shared configs (ESLint, TS, etc.)
│   ├── ui/                     # @noirwire/ui - Shared React components
│   ├── utils/                  # @noirwire/utils - Shared utilities
│   ├── db/                     # @noirwire/db - Supabase client & schema
│   └── solana-programs/        # Anchor programs + Noir circuits
│       ├── programs/           # Solana Anchor programs
│       │   ├── shielded-pool/
│       │   ├── zk-verifier/
│       │   └── vault-registry/
│       ├── circuits/           # Noir ZK circuits
│       │   ├── deposit/
│       │   ├── transfer/
│       │   ├── withdraw/
│       │   ├── batch/
│       │   └── primitives/
│       ├── tests/
│       └── Anchor.toml
│
├── scripts/                    # TypeScript utility scripts
│   ├── deploy-programs.ts      # Deploy Solana programs
│   ├── deploy-api.ts           # Deploy API to Railway
│   ├── generate-types.ts       # Generate TS types from Anchor IDL
│   ├── migrate-db.ts           # Supabase migrations
│   └── setup-dev.ts            # Development environment setup
│
├── supabase/                   # Supabase local development (VERSION CONTROLLED)
│   ├── migrations/             # Database migrations (SQL files)
│   │   ├── 20260101000000_initial_schema.sql
│   │   ├── 20260102000000_add_commitments.sql
│   │   └── 20260103000000_add_vaults.sql
│   ├── functions/              # Edge Functions (optional)
│   │   └── example/
│   │       └── index.ts
│   ├── seed.sql                # Seed data for local development
│   ├── config.toml             # Local Supabase configuration
│   └── .gitignore              # Supabase gitignore
│
├── .github/                    # GitHub configuration (FUTURE)
│   └── workflows/              # CI/CD pipelines (not for now)
│
├── docker/                     # Docker configurations
│   ├── api.Dockerfile
│   ├── indexer.Dockerfile
│   ├── web.Dockerfile
│   └── docker-compose.yml      # Local development setup
│
├── .vscode/                    # VS Code workspace settings
│   ├── extensions.json         # Recommended extensions (including Supabase)
│   ├── settings.json           # Workspace settings (Deno for Edge Functions)
│   └── launch.json             # Debug configurations
│
├── .env.example                # Example environment variables
├── .gitignore
├── .prettierrc.js              # Prettier config (shared)
├── .eslintrc.js                # ESLint config (shared)
├── package.json                # Root package.json
├── turbo.json                  # Turborepo configuration
├── tsconfig.json               # Root TypeScript config
├── yarn.lock
└── README.md
```

---

## 2. Package Manager Setup

### 2.1 Yarn Classic (v1.x)

Following **eth-scaffold-2** pattern, we use Yarn Classic for stability and ecosystem compatibility.

**Installation:**

```bash
# Install Yarn Classic globally (if not already installed)
npm install -g yarn

# Verify version
yarn --version  # Should be 1.x.x
```

### 2.2 Root `package.json`

```json
{
  "name": "noirwire-monorepo",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "typecheck": "turbo run typecheck",
    "clean": "turbo run clean && rm -rf node_modules",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,md}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,md}\""
  },
  "devDependencies": {
    "turbo": "^2.3.0",
    "prettier": "^3.2.5",
    "eslint": "^8.57.0",
    "typescript": "^5.3.3"
  },
  "engines": {
    "node": ">=20.0.0",
    "yarn": "1.x"
  }
}
```

### 2.3 Workspace Protocol

Packages reference each other using `workspace:*` protocol:

```json
{
  "dependencies": {
    "@noirwire/types": "workspace:*",
    "@noirwire/sdk": "workspace:*"
  }
}
```

---

## 3. Turborepo Configuration

### 3.1 `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**", "target/deploy/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"],
      "inputs": ["src/**/*.ts", "src/**/*.tsx", "test/**/*.ts"]
    },
    "test:e2e": {
      "cache": false
    },
    "clean": {
      "cache": false
    }
  }
}
```

> **Note:** Turborepo v2 renamed `pipeline` to `tasks`. The above uses the v2 syntax.

**Task Explanation:**

- `build`: Builds packages in dependency order
- `dev`: Runs dev servers (no caching, persistent)
- `lint`: Runs ESLint on all packages
- `typecheck`: Runs TypeScript compiler checks
- `test`: Runs unit tests with Vitest
- `test:e2e`: Runs E2E tests (Playwright/Cypress)

---

## 4. Apps Directory

### 4.1 Web App (`/apps/web`)

**Stack:**

- Next.js 14+ (App Router)
- React 18+
- Tailwind CSS + daisyUI
- TypeScript
- Solana wallet adapters

**Structure:**

```
apps/web/
├── src/
│   ├── app/                # Next.js app directory
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── (auth)/         # Route groups
│   │   ├── dashboard/
│   │   └── vaults/
│   ├── components/         # Page-specific components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities & clients
│   └── styles/
├── public/                 # Static assets
├── .env.local              # Environment variables (gitignored)
├── .env.example
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── Dockerfile
```

**`package.json`:**

```json
{
  "name": "@noirwire/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:e2e": "playwright test"
  },
  "dependencies": {
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@noirwire/sdk": "workspace:*",
    "@noirwire/types": "workspace:*",
    "@noirwire/ui": "workspace:*",
    "@solana/web3.js": "^1.91.0",
    "@solana/wallet-adapter-react": "^0.15.35",
    "daisyui": "^4.6.0"
  },
  "devDependencies": {
    "@noirwire/config": "workspace:*",
    "@types/react": "^18.2.0",
    "typescript": "^5.3.3",
    "tailwindcss": "^3.4.1",
    "vitest": "^1.2.0",
    "playwright": "^1.41.0"
  }
}
```

**Dockerfile:**

```dockerfile
# apps/web/Dockerfile
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Build the app
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED 1

RUN yarn build

# Production image
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000

CMD ["node", "server.js"]
```

---

### 4.2 API Backend (`/apps/api`)

**Stack:**

- NestJS
- Supabase (PostgreSQL)
- Redis
- TypeScript

**Structure:**

```
apps/api/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── modules/
│   │   ├── transfers/
│   │   │   ├── transfers.controller.ts
│   │   │   ├── transfers.service.ts
│   │   │   └── transfers.module.ts
│   │   ├── deposits/
│   │   ├── withdrawals/
│   │   ├── vaults/
│   │   └── webhooks/
│   ├── common/
│   │   ├── filters/
│   │   ├── guards/
│   │   └── interceptors/
│   └── config/
├── test/
│   ├── unit/
│   └── e2e/
├── .env
├── .env.example
├── nest-cli.json
├── tsconfig.json
├── package.json
└── Dockerfile
```

**`package.json`:**

```json
{
  "name": "@noirwire/api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:e2e": "vitest run --config vitest.config.e2e.ts"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/platform-express": "^10.3.0",
    "@noirwire/sdk": "workspace:*",
    "@noirwire/types": "workspace:*",
    "@noirwire/db": "workspace:*",
    "@supabase/supabase-js": "^2.39.0",
    "redis": "^4.6.12"
  },
  "devDependencies": {
    "@noirwire/config": "workspace:*",
    "@nestjs/cli": "^10.3.0",
    "@nestjs/testing": "^10.3.0",
    "vitest": "^1.2.0"
  }
}
```

---

### 4.3 Indexer Service (`/apps/indexer`)

**Stack:**

- NestJS (separate service)
- Supabase (for storage)
- Solana Web3.js

**Purpose:**

- Listens to Solana events
- Parses program logs
- Indexes transactions, commitments, nullifiers
- Writes to Supabase

**Structure:**

```
apps/indexer/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── modules/
│   │   ├── solana-listener/
│   │   │   ├── solana-listener.service.ts
│   │   │   └── solana-listener.module.ts
│   │   ├── event-parser/
│   │   └── indexer/
│   └── config/
├── test/
├── .env
├── .env.example
├── tsconfig.json
├── package.json
└── Dockerfile
```

**`package.json`:**

```json
{
  "name": "@noirwire/indexer",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "nest start --watch",
    "build": "nest build",
    "start": "node dist/main",
    "lint": "eslint \"{src,test}/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/core": "^10.3.0",
    "@noirwire/types": "workspace:*",
    "@noirwire/db": "workspace:*",
    "@solana/web3.js": "^1.91.0",
    "@coral-xyz/anchor": "^0.32.1"
  }
}
```

---

### 4.4 Documentation Site (`/apps/docs`)

**LOW PRIORITY** - Basic setup only

**Stack:**

- Nextra (Next.js-based docs framework)

**Structure:**

```
apps/docs/
├── pages/
│   ├── index.mdx
│   ├── getting-started.mdx
│   └── api/
├── theme.config.tsx
├── package.json
└── tsconfig.json
```

**Note:** Will be implemented after core functionality is complete.

---

## 5. Packages Directory

### 5.1 SDK Package (`/packages/sdk`)

**Main TypeScript SDK for interacting with NoirWire**

See blueprint [31_Client_SDK.md](31_Client_SDK.md) for full implementation details.

**Structure:**

```
packages/sdk/
├── src/
│   ├── index.ts
│   ├── wallet/
│   │   ├── NoirWireWallet.ts
│   │   └── types.ts
│   ├── api/
│   │   ├── client.ts
│   │   └── endpoints.ts
│   ├── transactions/
│   │   ├── deposit.ts
│   │   ├── transfer.ts
│   │   └── withdraw.ts
│   ├── vaults/
│   └── utils/
├── test/
├── package.json
├── tsconfig.json
└── README.md
```

**`package.json`:**

```json
{
  "name": "@noirwire/sdk",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "@noirwire/types": "workspace:*",
    "@solana/web3.js": "^1.91.0",
    "bip39": "^3.1.0",
    "tweetnacl": "^1.0.3"
  },
  "devDependencies": {
    "@noirwire/config": "workspace:*",
    "tsup": "^8.0.1",
    "vitest": "^1.2.0"
  }
}
```

---

### 5.2 Types Package (`/packages/types`)

**Shared TypeScript types across the monorepo**

**Structure:**

```
packages/types/
├── src/
│   ├── index.ts
│   ├── api.ts              # API request/response types
│   ├── blockchain.ts       # Solana/commitment types
│   ├── wallet.ts           # Wallet types
│   ├── vault.ts            # Vault types
│   └── zk.ts               # ZK proof types
├── package.json
└── tsconfig.json
```

**`package.json`:**

```json
{
  "name": "@noirwire/types",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@noirwire/config": "workspace:*",
    "tsup": "^8.0.1"
  }
}
```

---

### 5.3 Config Package (`/packages/config`)

**Shared configuration files (ESLint, TypeScript, Prettier, Tailwind)**

**Structure:**

```
packages/config/
├── eslint/
│   ├── base.js
│   ├── next.js
│   └── nest.js
├── typescript/
│   ├── base.json
│   ├── nextjs.json
│   └── nest.json
├── tailwind/
│   └── base.js
├── prettier/
│   └── index.js
├── package.json
└── README.md
```

**`package.json`:**

```json
{
  "name": "@noirwire/config",
  "version": "0.1.0",
  "files": ["eslint", "typescript", "tailwind", "prettier"],
  "dependencies": {
    "@typescript-eslint/eslint-plugin": "^6.19.0",
    "@typescript-eslint/parser": "^6.19.0",
    "eslint-config-next": "^14.1.0",
    "eslint-config-prettier": "^9.1.0",
    "prettier": "^3.2.5",
    "prettier-plugin-tailwindcss": "^0.5.11",
    "tailwindcss": "^3.4.1",
    "daisyui": "^4.6.0"
  }
}
```

**`eslint/base.js`:**

```js
module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  rules: {
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    "@typescript-eslint/no-explicit-any": "warn",
  },
};
```

**`prettier/index.js`:**

```js
module.exports = {
  semi: true,
  singleQuote: true,
  tabWidth: 2,
  trailingComma: "es5",
  printWidth: 100,
  plugins: ["prettier-plugin-tailwindcss"],
};
```

**`tailwind/base.js`:**

```js
module.exports = {
  content: [],
  theme: {
    extend: {},
  },
  plugins: [require("daisyui")],
  daisyui: {
    themes: ["light", "dark", "cupcake"],
  },
};
```

---

### 5.4 UI Package (`/packages/ui`)

**Shared React components (buttons, modals, forms, etc.)**

**Structure:**

```
packages/ui/
├── src/
│   ├── index.ts
│   ├── components/
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   ├── Button.test.tsx
│   │   │   └── index.ts
│   │   ├── Modal/
│   │   ├── Input/
│   │   ├── Card/
│   │   └── WalletConnect/
│   └── styles/
│       └── globals.css
├── package.json
├── tsconfig.json
└── tailwind.config.js
```

**`package.json`:**

```json
{
  "name": "@noirwire/ui",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./styles": "./dist/styles/globals.css"
  },
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts --external react",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch --external react",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit",
    "test": "vitest"
  },
  "dependencies": {
    "@noirwire/types": "workspace:*",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.1"
  },
  "devDependencies": {
    "@noirwire/config": "workspace:*",
    "@types/react": "^18.2.0",
    "react": "^18.2.0",
    "tsup": "^8.0.1",
    "vitest": "^1.2.0",
    "tailwindcss": "^3.4.1"
  },
  "peerDependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

---

### 5.5 Utils Package (`/packages/utils`)

**Shared utility functions**

**Structure:**

```
packages/utils/
├── src/
│   ├── index.ts
│   ├── crypto.ts           # Cryptographic utilities
│   ├── formatting.ts       # Number/string formatting
│   ├── validation.ts       # Input validation
│   └── solana.ts           # Solana helpers
├── test/
├── package.json
└── tsconfig.json
```

---

### 5.6 Database Package (`/packages/db`)

**Supabase client and database schema**

**Structure:**

```
packages/db/
├── src/
│   ├── index.ts
│   ├── client.ts           # Supabase client initialization
│   ├── schema.ts           # Type-safe schema definitions
│   └── migrations/         # SQL migration files
│       ├── 001_initial_schema.sql
│       └── 002_add_vaults.sql
├── supabase/
│   └── config.toml
├── package.json
└── tsconfig.json
```

**`package.json`:**

```json
{
  "name": "@noirwire/db",
  "version": "0.1.0",
  "main": "./dist/index.js",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format cjs,esm --dts",
    "dev": "tsup src/index.ts --format cjs,esm --dts --watch",
    "migrate": "tsx src/migrations/run.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.39.0",
    "@noirwire/types": "workspace:*"
  },
  "devDependencies": {
    "tsup": "^8.0.1",
    "tsx": "^4.7.0"
  }
}
```

---

### 5.7 Solana Programs Package (`/packages/solana-programs`)

**Anchor programs + Noir circuits**

See blueprints:

- [10_Solana_Programs.md](10_Solana_Programs.md) for Anchor programs
- [01_Zk_Noir_Circuits.md](01_Zk_Noir_Circuits.md) for Noir circuits
- [02_Noir_Implementation.md](02_Noir_Implementation.md) for circuit implementation

**Structure:**

```
packages/solana-programs/
├── programs/                   # Anchor programs (Rust)
│   ├── shielded-pool/
│   │   ├── src/
│   │   │   ├── lib.rs
│   │   │   ├── instructions/
│   │   │   ├── state/
│   │   │   └── errors.rs
│   │   ├── Cargo.toml
│   │   └── Xargo.toml
│   ├── zk-verifier/
│   │   └── src/
│   └── vault-registry/
│       └── src/
│
├── circuits/                   # Noir ZK circuits
│   ├── deposit/
│   │   ├── src/
│   │   │   └── main.nr
│   │   ├── Nargo.toml
│   │   └── Prover.toml
│   ├── transfer/
│   │   └── src/
│   ├── withdraw/
│   │   └── src/
│   ├── batch/
│   │   ├── batch_2/
│   │   ├── batch_4/
│   │   ├── batch_8/
│   │   ├── batch_16/
│   │   ├── batch_32/
│   │   └── batch_64/
│   └── primitives/             # Shared Noir libraries
│       ├── src/
│       │   ├── lib.nr
│       │   ├── commitment.nr
│       │   ├── merkle.nr
│       │   └── nullifier.nr
│       └── Nargo.toml
│
├── tests/                      # Anchor tests
│   ├── shielded-pool.test.ts
│   ├── zk-verifier.test.ts
│   └── integration.test.ts
│
├── migrations/                 # Anchor deploy scripts
│   └── deploy.ts
│
├── target/                     # Build output (gitignored)
│   └── deploy/
│
├── Anchor.toml                 # Anchor configuration
├── Cargo.toml                  # Workspace Cargo.toml
├── package.json                # For TypeScript tests
└── tsconfig.json
```

**`Anchor.toml`:**

```toml
[toolchain]
anchor_version = "0.32.1"

[programs.localnet]
shielded_pool = "NwirePoo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
zk_verifier = "NwireVrfyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
vault_registry = "NwireVau1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

[programs.devnet]
shielded_pool = "NwirePoo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
zk_verifier = "NwireVrfyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
vault_registry = "NwireVau1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

[programs.mainnet]
shielded_pool = "NwirePoo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
zk_verifier = "NwireVrfyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
vault_registry = "NwireVau1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.test.ts"
```

**`Cargo.toml` (workspace):**

```toml
[workspace]
members = [
    "programs/shielded-pool",
    "programs/zk-verifier",
    "programs/vault-registry",
]

[profile.release]
overflow-checks = true
lto = "fat"
codegen-units = 1

[profile.release.build-override]
opt-level = 3
incremental = false
codegen-units = 1
```

**`package.json`:**

```json
{
  "name": "@noirwire/solana-programs",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "anchor build",
    "build:circuits": "cd circuits && nargo compile --workspace",
    "test": "anchor test",
    "test:circuits": "cd circuits && nargo test --workspace",
    "deploy": "anchor deploy",
    "deploy:devnet": "anchor deploy --provider.cluster devnet",
    "deploy:mainnet": "anchor deploy --provider.cluster mainnet",
    "typecheck": "tsc --noEmit",
    "clean": "anchor clean && cd circuits && nargo clean"
  },
  "dependencies": {
    "@coral-xyz/anchor": "^0.32.1",
    "@solana/web3.js": "^1.91.0"
  },
  "devDependencies": {
    "@noirwire/types": "workspace:*",
    "@types/mocha": "^10.0.6",
    "chai": "^4.4.1",
    "mocha": "^10.2.0",
    "ts-mocha": "^10.0.0",
    "typescript": "^5.3.3"
  }
}
```

**Noir Circuit Example (`circuits/deposit/Nargo.toml`):**

```toml
[package]
name = "deposit"
type = "bin"
authors = ["NoirWire Team"]
compiler_version = ">=0.34.0"

[dependencies]
primitives = { path = "../primitives" }
# ⚠️ Verify compatible version before implementation
poseidon = { git = "https://github.com/noir-lang/noir_hashes", branch = "main" }
```

> **Note:** Noir versions evolve rapidly. Check [github.com/noir-lang/noir/releases](https://github.com/noir-lang/noir/releases) for latest stable before implementation.

---

## 6. Scripts Directory

TypeScript utility scripts for development and deployment.

**Structure:**

```
scripts/
├── deploy-programs.ts          # Deploy Solana programs to devnet/mainnet
├── deploy-api.ts               # Deploy API/indexer to Railway
├── generate-types.ts           # Generate TS types from Anchor IDL
├── migrate-db.ts               # Run Supabase migrations
├── setup-dev.ts                # Setup local development environment
├── benchmark-circuits.ts       # Benchmark Noir circuits
├── verify-proofs.ts            # Verify proof generation
└── utils/
    ├── logger.ts
    └── config.ts
```

**Example: `generate-types.ts`**

```typescript
#!/usr/bin/env tsx

import { Program } from "@coral-xyz/anchor";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

/**
 * Generate TypeScript types from Anchor IDL
 */
async function generateTypes() {
  const idlPath = join(__dirname, "../packages/solana-programs/target/idl");
  const outputPath = join(__dirname, "../packages/types/src/generated");

  const programs = ["shielded_pool", "zk_verifier", "vault_registry"];

  for (const program of programs) {
    console.log(`Generating types for ${program}...`);

    const idl = JSON.parse(
      readFileSync(join(idlPath, `${program}.json`), "utf-8"),
    );

    // Generate TypeScript types
    const types = generateTypesFromIDL(idl);

    writeFileSync(join(outputPath, `${program}.ts`), types);

    console.log(`✓ Generated ${program}.ts`);
  }
}

function generateTypesFromIDL(idl: any): string {
  // Implementation here
  return `// Generated from IDL\nexport type ${idl.name} = {\n  // ...\n};\n`;
}

generateTypes().catch(console.error);
```

**Usage:**

```bash
# Run script
yarn tsx scripts/generate-types.ts

# Or via package.json script
yarn generate-types
```

---

## 7. Shared Configuration

### 7.1 Root `.prettierrc.js`

```js
module.exports = require("@noirwire/config/prettier");
```

### 7.2 Root `.eslintrc.js`

```js
module.exports = {
  root: true,
  extends: ["@noirwire/config/eslint/base"],
  ignorePatterns: ["node_modules", "dist", ".next", "target", "coverage"],
};
```

### 7.3 Root `tsconfig.json`

```json
{
  "extends": "@noirwire/config/typescript/base.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@noirwire/*": ["packages/*/src"]
    }
  },
  "exclude": ["node_modules", "dist", ".next", "target"]
}
```

### 7.4 Environment Variables

**Root `.env.example`:**

```bash
# Shared environment variables (examples)

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_NETWORK=devnet

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=xxxxx
SUPABASE_SERVICE_ROLE_KEY=xxxxx

# Redis
REDIS_URL=redis://localhost:6379

# API
API_PORT=8080
API_URL=http://localhost:8080

# PER Executor
PER_EXECUTOR_URL=https://per.noirwire.com

# MagicBlock
MAGICBLOCK_TEE_ENDPOINT=https://tee.magicblock.app
```

**Per-app `.env` files:**

- `/apps/web/.env.local` - Web app environment variables
- `/apps/api/.env` - API backend environment variables
- `/apps/indexer/.env` - Indexer environment variables

---

## 8. Development Workflow

### 8.1 Initial Setup

```bash
# Clone repository
git clone https://github.com/noirwire/noirwire.git
cd noirwire

# Install dependencies
yarn install

# Build all packages
yarn build

# Start development servers
yarn dev
```

### 8.2 Common Commands

```bash
# Run all apps in dev mode
yarn dev

# Run specific app
yarn workspace @noirwire/web dev
yarn workspace @noirwire/api dev

# Build everything
yarn build

# Build specific package
yarn workspace @noirwire/sdk build

# Run tests
yarn test

# Run tests for specific package
yarn workspace @noirwire/sdk test

# Lint all packages
yarn lint

# Format all code
yarn format

# Type check
yarn typecheck

# Clean all build artifacts
yarn clean
```

### 8.3 Adding New Dependencies

```bash
# Add dependency to specific package
yarn workspace @noirwire/web add package-name

# Add dev dependency to specific package
yarn workspace @noirwire/web add -D package-name

# Add dependency to root
yarn add -W package-name
```

### 8.4 Development Flow

1. **Start local Solana validator:**

   ```bash
   solana-test-validator
   ```

2. **Deploy programs locally:**

   ```bash
   cd packages/solana-programs
   anchor build
   anchor deploy
   ```

3. **Start services:**

   ```bash
   # Terminal 1: API
   yarn workspace @noirwire/api dev

   # Terminal 2: Indexer
   yarn workspace @noirwire/indexer dev

   # Terminal 3: Web
   yarn workspace @noirwire/web dev
   ```

4. **Access apps:**
   - Web: http://localhost:3000
   - API: http://localhost:8080
   - Indexer: Background service

---

## 9. Build & Deploy

### 9.1 Build Process

**Turborepo builds in the correct order:**

```bash
# Build order (automatic via Turborepo):
1. packages/types        # No dependencies
2. packages/config       # No dependencies
3. packages/utils        # Depends on types
4. packages/db           # Depends on types
5. packages/ui           # Depends on types
6. packages/sdk          # Depends on types, utils
7. apps/web              # Depends on sdk, ui, types
8. apps/api              # Depends on sdk, db, types
9. apps/indexer          # Depends on types, db
```

**Build command:**

```bash
yarn build
```

### 9.2 Deployment

#### Web App (Railway)

```bash
# Build Docker image
docker build -f apps/web/Dockerfile -t noirwire-web .

# Deploy to Railway (via GitHub integration)
# Railway auto-detects Dockerfile and deploys
```

#### API Backend (Railway)

```bash
# Build Docker image
docker build -f apps/api/Dockerfile -t noirwire-api .

# Deploy to Railway
```

#### Indexer (Railway)

```bash
# Build Docker image
docker build -f apps/indexer/Dockerfile -t noirwire-indexer .

# Deploy to Railway
```

#### Solana Programs

```bash
# Build programs
cd packages/solana-programs
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Deploy to mainnet (use with caution)
anchor deploy --provider.cluster mainnet
```

### 9.3 Docker Compose (Local Development)

**`docker/docker-compose.yml`:**

```yaml
version: "3.8"

services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_USER: noirwire
      POSTGRES_PASSWORD: noirwire
      POSTGRES_DB: noirwire
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    ports:
      - "8080:8080"
    environment:
      DATABASE_URL: postgresql://noirwire:noirwire@postgres:5432/noirwire
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

  indexer:
    build:
      context: ..
      dockerfile: apps/indexer/Dockerfile
    environment:
      DATABASE_URL: postgresql://noirwire:noirwire@postgres:5432/noirwire
    depends_on:
      - postgres

  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8080
    depends_on:
      - api

volumes:
  postgres_data:
```

**Start all services:**

```bash
docker-compose -f docker/docker-compose.yml up
```

---

## 10. Testing Strategy

### 10.1 Unit Tests (Vitest)

**Each package has its own tests:**

```
packages/sdk/
├── src/
│   └── wallet/
│       └── NoirWireWallet.ts
└── test/
    └── wallet/
        └── NoirWireWallet.test.ts
```

**Run tests:**

```bash
# All tests
yarn test

# Specific package
yarn workspace @noirwire/sdk test

# Watch mode
yarn workspace @noirwire/sdk test --watch
```

**Example test (`packages/sdk/test/wallet/NoirWireWallet.test.ts`):**

```typescript
import { describe, it, expect } from "vitest";
import { NoirWireWallet } from "../../src/wallet/NoirWireWallet";

describe("NoirWireWallet", () => {
  it("should generate new wallet", () => {
    const wallet = NoirWireWallet.generate();
    expect(wallet.publicKey).toBeDefined();
    expect(wallet.secretKey).toBeDefined();
  });

  it("should restore from mnemonic", () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const wallet = NoirWireWallet.fromMnemonic(mnemonic);
    expect(wallet.publicKey).toBeDefined();
  });
});
```

### 10.2 E2E Tests

**Playwright (for web app):**

```
apps/web/
└── e2e/
    ├── deposit.spec.ts
    ├── transfer.spec.ts
    └── withdraw.spec.ts
```

**Example (`apps/web/e2e/deposit.spec.ts`):**

```typescript
import { test, expect } from "@playwright/test";

test("user can deposit SOL", async ({ page }) => {
  await page.goto("http://localhost:3000");

  // Connect wallet
  await page.click('button:has-text("Connect Wallet")');

  // Navigate to deposit
  await page.click('a:has-text("Deposit")');

  // Enter amount
  await page.fill('input[name="amount"]', "10");

  // Submit
  await page.click('button:has-text("Deposit")');

  // Wait for confirmation
  await expect(page.locator("text=Deposit successful")).toBeVisible();
});
```

**Cypress (for API):**

```
apps/api/
└── test/
    └── e2e/
        ├── deposits.e2e.test.ts
        └── transfers.e2e.test.ts
```

### 10.3 Integration Tests (Anchor)

**Solana program tests:**

```
packages/solana-programs/
└── tests/
    ├── shielded-pool.test.ts
    └── integration.test.ts
```

**Run Anchor tests:**

```bash
cd packages/solana-programs
anchor test
```

---

## 11. Supabase Local Development

### 11.1 Overview

NoirWire uses [Supabase](https://supabase.com/docs/guides/local-development/overview) for:

- **Database**: PostgreSQL for commitments, transactions, vaults
- **Real-time**: WebSocket subscriptions for transaction updates
- **Storage**: Encrypted notes and proof artifacts (optional)

All Supabase development happens **locally first**, then migrations are applied to staging/production.

### 11.2 Supabase Folder Structure

The `/supabase` folder at the root is **version controlled** and contains:

```
supabase/
├── migrations/                         # SQL migration files (timestamped)
│   ├── 20260101000000_initial_schema.sql
│   ├── 20260102000000_add_commitments.sql
│   ├── 20260103000000_add_transactions.sql
│   ├── 20260104000000_add_vaults.sql
│   └── 20260105000000_add_indexes.sql
│
├── functions/                          # Edge Functions (optional)
│   ├── process-webhook/
│   │   ├── index.ts
│   │   └── deno.json
│   └── validate-proof/
│       └── index.ts
│
├── seed.sql                            # Seed data for local development
├── config.toml                         # Local Supabase configuration
└── .gitignore                          # Generated files to ignore
```

**What gets committed:**

- ✅ `/supabase/migrations/*.sql` - All migrations
- ✅ `/supabase/seed.sql` - Seed data
- ✅ `/supabase/config.toml` - Configuration
- ✅ `/supabase/functions/**` - Edge Functions
- ❌ `/supabase/.temp/` - Temporary files (gitignored)

### 11.3 Initial Setup

#### Install Supabase CLI

```bash
# macOS
brew install supabase/tap/supabase

# Windows (scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux
brew install supabase/tap/supabase

# Or via npm (cross-platform)
npm install -g supabase
```

**Verify installation:**

```bash
supabase --version
# v1.191.3 or later
```

#### Initialize Supabase in Project

```bash
# Navigate to monorepo root
cd noirwire/

# Initialize Supabase
supabase init

# This creates:
# - supabase/config.toml
# - supabase/.gitignore
```

### 11.4 Local Development Workflow

#### Start Local Supabase

```bash
# Start all Supabase services locally
supabase start

# Output:
#   Started supabase local development setup.
#
#          API URL: http://localhost:54321
#      GraphQL URL: http://localhost:54321/graphql/v1
#           DB URL: postgresql://postgres:postgres@localhost:54322/postgres
#       Studio URL: http://localhost:54323
#     Inbucket URL: http://localhost:54324
#       JWT secret: super-secret-jwt-token-with-at-least-32-characters-long
#         anon key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
# service_role key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Services started:**

- **PostgreSQL**: Port 54322
- **PostgREST API**: Port 54321
- **Supabase Studio**: http://localhost:54323 (Database UI)
- **Edge Functions Runtime**: Port 54321
- **Inbucket** (email testing): Port 54324

#### Create a Migration

```bash
# Create a new migration file
supabase migration new initial_schema

# This creates: supabase/migrations/<timestamp>_initial_schema.sql
```

**Example migration (`supabase/migrations/20260101000000_initial_schema.sql`):**

```sql
-- Create commitments table
CREATE TABLE commitments (
  id BIGSERIAL PRIMARY KEY,
  commitment BYTEA NOT NULL UNIQUE,
  pool_address TEXT NOT NULL,
  amount BIGINT NOT NULL,
  owner_hash BYTEA,
  vault_id BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  leaf_index BIGINT,

  -- Indexes
  CONSTRAINT commitment_length CHECK (LENGTH(commitment) = 32)
);

CREATE INDEX idx_commitments_pool ON commitments(pool_address);
CREATE INDEX idx_commitments_vault ON commitments(vault_id) WHERE vault_id IS NOT NULL;

-- Create transactions table
CREATE TABLE transactions (
  id BIGSERIAL PRIMARY KEY,
  signature TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL, -- 'deposit', 'transfer', 'withdraw', 'batch_settle'
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'confirmed', 'failed'
  pool_address TEXT NOT NULL,
  amount BIGINT,
  nullifier BYTEA,
  commitment BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  confirmed_at TIMESTAMPTZ,

  -- Indexes
  CONSTRAINT tx_type CHECK (type IN ('deposit', 'transfer', 'withdraw', 'batch_settle')),
  CONSTRAINT tx_status CHECK (status IN ('pending', 'confirmed', 'failed'))
);

CREATE INDEX idx_transactions_pool ON transactions(pool_address);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created ON transactions(created_at DESC);

-- Create vaults table
CREATE TABLE vaults (
  id BIGSERIAL PRIMARY KEY,
  vault_id BYTEA NOT NULL UNIQUE,
  name TEXT,
  members_root BYTEA NOT NULL,
  member_count INTEGER DEFAULT 1,
  admin_pubkey BYTEA NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT vault_id_length CHECK (LENGTH(vault_id) = 32)
);

CREATE INDEX idx_vaults_admin ON vaults(admin_pubkey);

-- Enable Row Level Security (RLS)
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vaults ENABLE ROW LEVEL SECURITY;

-- Create policies (public read for now, update based on requirements)
CREATE POLICY "Enable read access for all users" ON commitments FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON transactions FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON vaults FOR SELECT USING (true);
```

#### Apply Migrations

```bash
# Reset database and apply all migrations
supabase db reset

# This:
# 1. Drops the local database
# 2. Recreates it
# 3. Applies all migrations in supabase/migrations/
# 4. Runs supabase/seed.sql (if exists)
```

#### Seed Data

**Create `supabase/seed.sql`:**

```sql
-- Seed data for local development

-- Insert test vault
INSERT INTO vaults (vault_id, name, members_root, admin_pubkey) VALUES
  (decode('0000000000000000000000000000000000000000000000000000000000000001', 'hex'),
   'Test DAO Treasury',
   decode('1111111111111111111111111111111111111111111111111111111111111111', 'hex'),
   decode('2222222222222222222222222222222222222222222222222222222222222222', 'hex'));

-- Insert test commitments
INSERT INTO commitments (commitment, pool_address, amount, leaf_index) VALUES
  (decode('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex'),
   'NwirePoo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
   1000000000,
   0),
  (decode('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'hex'),
   'NwirePoo1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
   500000000,
   1);
```

### 11.5 VS Code Supabase Extension

#### Install Extension

1. Open VS Code Extensions (Cmd/Ctrl + Shift + X)
2. Search for **"Supabase"** by Supabase
3. Install the [official extension](https://marketplace.visualstudio.com/items?itemName=Supabase.vscode-supabase-extension)

**Or add to `.vscode/extensions.json`:**

```json
{
  "recommendations": [
    "supabase.vscode-supabase-extension",
    "denoland.vscode-deno",
    "bradlc.vscode-tailwindcss",
    "esbenp.prettier-vscode",
    "dbaeumer.vscode-eslint"
  ]
}
```

#### Extension Features

**1. Database Inspection**

- View tables, columns, types directly in VS Code
- Browse data without leaving your editor
- Right-click tables to generate types

**2. GitHub Copilot Integration**

```typescript
// In any file, use Copilot Chat:
// @supabase - provides database schema as context
// @supabase /migration create users table - generates migration
```

**3. Migration Generation**

- Type `@supabase /migration <description>` in Copilot
- Extension generates SQL migration based on your request

**4. Type Generation**

- Automatically generate TypeScript types from database schema
- Keep types in sync with migrations

**5. Storage Buckets**

- List and manage storage buckets
- View bucket policies

#### VS Code Settings

**Create `.vscode/settings.json`:**

```json
{
  // Supabase
  "supabase.projectId": "local",

  // Deno (for Edge Functions)
  "deno.enable": true,
  "deno.enablePaths": ["supabase/functions"],
  "deno.lint": true,
  "deno.unstable": true,

  // TypeScript
  "[typescript]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode",
    "editor.formatOnSave": true
  },

  // SQL formatting
  "[sql]": {
    "editor.defaultFormatter": "bradlc.vscode-tailwindcss"
  }
}
```

### 11.6 Generate TypeScript Types

#### Automatic Type Generation

```bash
# Generate types from local database
supabase gen types typescript --local > packages/db/src/generated/database.types.ts
```

**Example output (`packages/db/src/generated/database.types.ts`):**

```typescript
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      commitments: {
        Row: {
          id: number;
          commitment: Buffer;
          pool_address: string;
          amount: number;
          owner_hash: Buffer | null;
          vault_id: Buffer | null;
          created_at: string | null;
          leaf_index: number | null;
        };
        Insert: {
          id?: number;
          commitment: Buffer;
          pool_address: string;
          amount: number;
          owner_hash?: Buffer | null;
          vault_id?: Buffer | null;
          created_at?: string | null;
          leaf_index?: number | null;
        };
        Update: {
          id?: number;
          commitment?: Buffer;
          pool_address?: string;
          amount?: number;
          owner_hash?: Buffer | null;
          vault_id?: Buffer | null;
          created_at?: string | null;
          leaf_index?: number | null;
        };
      };
      // ... other tables
    };
    Views: {
      // ... views
    };
    Functions: {
      // ... functions
    };
    Enums: {
      // ... enums
    };
  };
}
```

**Update `packages/db/package.json`:**

```json
{
  "scripts": {
    "generate:types": "supabase gen types typescript --local > src/generated/database.types.ts"
  }
}
```

#### Use Generated Types

**In `packages/db/src/client.ts`:**

```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./generated/database.types";

export const supabase = createClient<Database>(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
);

// Now fully typed!
const { data, error } = await supabase
  .from("commitments")
  .select("*")
  .eq("pool_address", "NwirePoo1...")
  .single();

// data is typed as Database['public']['Tables']['commitments']['Row']
```

### 11.7 Link to Remote (Staging/Production)

#### Link Local Project to Supabase Cloud

```bash
# Login to Supabase
supabase login

# Link to remote project
supabase link --project-ref <your-project-ref>

# Pull remote schema (creates migration)
supabase db pull

# This creates: supabase/migrations/<timestamp>_remote_schema.sql
```

#### Push Migrations to Remote

```bash
# Push local migrations to remote
supabase db push

# Or deploy migrations as part of CI/CD
```

### 11.8 Common Commands

```bash
# Start local Supabase
supabase start

# Stop local Supabase
supabase stop

# View status
supabase status

# Reset database (reapply all migrations)
supabase db reset

# Create new migration
supabase migration new <migration_name>

# Generate types
supabase gen types typescript --local > packages/db/src/generated/database.types.ts

# Pull remote schema
supabase db pull

# Push local migrations to remote
supabase db push

# Access Studio (database UI)
# Open http://localhost:54323
```

### 11.9 Integration with Monorepo

#### Update Root `package.json`

```json
{
  "scripts": {
    "supabase:start": "supabase start",
    "supabase:stop": "supabase stop",
    "supabase:reset": "supabase db reset",
    "supabase:migrate": "supabase migration new",
    "supabase:types": "supabase gen types typescript --local > packages/db/src/generated/database.types.ts",
    "dev": "supabase start && turbo run dev",
    "dev:db": "supabase start && supabase studio"
  }
}
```

#### Update `packages/db` Package

**Structure:**

```
packages/db/
├── src/
│   ├── index.ts                        # Export client
│   ├── client.ts                       # Supabase client
│   ├── generated/
│   │   └── database.types.ts           # Generated types
│   └── queries/
│       ├── commitments.ts              # Commitment queries
│       ├── transactions.ts             # Transaction queries
│       └── vaults.ts                   # Vault queries
├── package.json
└── tsconfig.json
```

**`packages/db/src/client.ts`:**

```typescript
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./generated/database.types";

const supabaseUrl = process.env.SUPABASE_URL || "http://localhost:54321";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "your-anon-key";

export const supabase = createClient<Database>(supabaseUrl, supabaseKey);
```

**`packages/db/src/queries/commitments.ts`:**

```typescript
import { supabase } from "../client";
import type { Database } from "../generated/database.types";

type Commitment = Database["public"]["Tables"]["commitments"]["Row"];

export async function getCommitmentsByPool(
  poolAddress: string,
): Promise<Commitment[]> {
  const { data, error } = await supabase
    .from("commitments")
    .select("*")
    .eq("pool_address", poolAddress)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function insertCommitment(
  commitment: Database["public"]["Tables"]["commitments"]["Insert"],
): Promise<Commitment> {
  const { data, error } = await supabase
    .from("commitments")
    .insert(commitment)
    .select()
    .single();

  if (error) throw error;
  return data;
}
```

### 11.10 Environment Variables

**Update `.env.example`:**

```bash
# Supabase (local development)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Supabase (production)
# SUPABASE_URL=https://xxxxx.supabase.co
# SUPABASE_ANON_KEY=your-production-anon-key
# SUPABASE_SERVICE_ROLE_KEY=your-production-service-role-key
```

**Per-app `.env` files inherit from root `.env.example`**

---

## Summary

| Component           | Technology                   | Location                             | Purpose                      |
| ------------------- | ---------------------------- | ------------------------------------ | ---------------------------- |
| **Web App**         | Next.js + Tailwind + daisyUI | `/apps/web`                          | User-facing application      |
| **API Backend**     | NestJS + Supabase + Redis    | `/apps/api`                          | REST API & WebSocket server  |
| **Indexer**         | NestJS + Solana Web3         | `/apps/indexer`                      | Transaction indexer service  |
| **Docs**            | Nextra                       | `/apps/docs`                         | Documentation (LOW PRIORITY) |
| **SDK**             | TypeScript                   | `/packages/sdk`                      | Client SDK for developers    |
| **Types**           | TypeScript                   | `/packages/types`                    | Shared type definitions      |
| **Config**          | ESLint/TS/Prettier           | `/packages/config`                   | Shared configurations        |
| **UI**              | React + Tailwind             | `/packages/ui`                       | Shared React components      |
| **Utils**           | TypeScript                   | `/packages/utils`                    | Shared utility functions     |
| **DB**              | Supabase client              | `/packages/db`                       | Database client & schema     |
| **Solana Programs** | Anchor (Rust)                | `/packages/solana-programs/programs` | On-chain programs            |
| **Noir Circuits**   | Noir                         | `/packages/solana-programs/circuits` | ZK circuits                  |

---

## Next Steps

1. Initialize monorepo structure
2. Set up Turborepo configuration
3. Create base packages (types, config, utils)
4. Implement SDK (see [31_Client_SDK.md](31_Client_SDK.md))
5. Build Solana programs (see [10_Solana_Programs.md](10_Solana_Programs.md))
6. Implement Noir circuits (see [01_Zk_Noir_Circuits.md](01_Zk_Noir_Circuits.md))
7. Create API backend (see [30_API_Backend.md](30_API_Backend.md))
8. Build web application
9. Deploy to Railway

---

## References

- [Turborepo Documentation](https://turbo.build/repo/docs)
- [Yarn Workspaces](https://classic.yarnpkg.com/en/docs/workspaces/)
- [eth-scaffold-2 Reference](https://github.com/scaffold-eth/scaffold-eth-2)
- [Next.js Documentation](https://nextjs.org/docs)
- [NestJS Documentation](https://docs.nestjs.com/)
- [Anchor Framework](https://www.anchor-lang.com/)
- [Noir Language](https://noir-lang.org/)

---

_Blueprint Version: 1.0_
_Status: Ready for Implementation_
_Dependencies: Foundation for all other blueprints_
