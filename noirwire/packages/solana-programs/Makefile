# NoirWire Devnet Deployment - Quick Fix Makefile
# Run from: /packages/solana-programs/
#
# Usage:
#   make fix-all          # Apply all fixes
#   make fix-versions     # Fix version mismatch
#   make fix-deps         # Add missing dependencies
#   make verify           # Verify fixes were applied
#   make deploy-vks       # Generate and deploy VKs to devnet
#   make init-pool        # Initialize pool on devnet

.PHONY: help fix-all fix-versions fix-deps verify deploy-vks init-pool clean

help:
	@echo "NoirWire Devnet Deployment - Quick Fix"
	@echo "======================================="
	@echo ""
	@echo "Available targets:"
	@echo "  make fix-all       - Apply all fixes (versions + dependencies)"
	@echo "  make fix-versions  - Update @noir-lang/backend_barretenberg to 0.36.0"
	@echo "  make fix-deps      - Add missing js-sha3 dependency"
	@echo "  make verify        - Verify all fixes were applied correctly"
	@echo "  make deploy-vks    - Generate and deploy verification keys to devnet"
	@echo "  make init-pool     - Initialize pool on devnet"
	@echo "  make clean         - Clean generated files"
	@echo ""
	@echo "Quick start:"
	@echo "  1. make fix-all"
	@echo "  2. make verify"
	@echo "  3. make deploy-vks"
	@echo "  4. make init-pool"

fix-all: fix-versions fix-deps
	@echo ""
	@echo "✅ All fixes applied!"
	@echo ""
	@echo "Run 'make verify' to check everything is correct"

fix-versions:
	@echo "📦 Fixing @noir-lang/backend_barretenberg version mismatch..."
	@echo "   Current: 0.35.0"
	@echo "   Required: 0.36.0"
	@yarn add @noir-lang/backend_barretenberg@0.36.0 --dev
	@echo "✅ Version updated"

fix-deps:
	@echo "📦 Adding missing js-sha3 dependency..."
	@yarn add js-sha3
	@echo "✅ js-sha3 installed"

verify:
	@echo "🔍 Verifying fixes..."
	@echo ""
	@echo "1. Checking @noir-lang/backend_barretenberg version:"
	@yarn list --pattern @noir-lang/backend_barretenberg --depth=0 2>/dev/null | grep "@noir-lang/backend_barretenberg@" || echo "   ❌ Not found"
	@echo ""
	@echo "2. Checking js-sha3:"
	@yarn list --pattern js-sha3 --depth=0 2>/dev/null | grep "js-sha3@" || echo "   ❌ Not found"
	@echo ""
	@echo "3. Checking Noir compiler version:"
	@cd ../../packages/noir-circuits && nargo --version | grep "nargo version"
	@echo ""
	@echo "✅ Verification complete"
	@echo ""
	@echo "⚠️  MANUAL FIX NEEDED: Edit scripts/init-pool.ts"
	@echo "   Add after line 54: const SHIELDED_POOL_PROGRAM_ID = programId;"

deploy-vks:
	@echo "🔑 Generating and deploying verification keys to devnet..."
	@echo ""
	@echo "⚠️  Make sure environment is set:"
	@echo "   export ANCHOR_WALLET=.devnet-keypair.json"
	@echo "   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com"
	@echo ""
	@read -p "Press Enter to continue or Ctrl+C to cancel..."
	@yarn generate-and-deploy-vks

init-pool:
	@echo "🏊 Initializing pool on devnet..."
	@echo ""
	@echo "⚠️  Make sure environment is set:"
	@echo "   export ANCHOR_WALLET=.devnet-keypair.json"
	@echo "   export ANCHOR_PROVIDER_URL=https://api.devnet.solana.com"
	@echo ""
	@read -p "Press Enter to continue or Ctrl+C to cancel..."
	@yarn init-pool --devnet

clean:
	@echo "🧹 Cleaning generated files..."
	@rm -f .pool-info.json
	@rm -rf vks/
	@echo "✅ Clean complete"
