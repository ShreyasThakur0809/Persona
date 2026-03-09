#!/usr/bin/env bash
# ── Persona Circuit Compilation Script ────────────────────────────────────────
# Compiles the ageProof.circom circuit, runs a Groth16 trusted setup ceremony,
# and exports the Solidity verifier to the contracts package.
#
# Prerequisites:
#   - circom 2.x installed: https://docs.circom.io/getting-started/installation/
#   - snarkjs installed: npm install -g snarkjs  (or use pnpm dlx)
#   - Powers of Tau file (pot12_final.ptau) — download once, reuse forever
#
# Usage:
#   cd packages/circuits
#   bash scripts/compile.sh

set -euo pipefail

CIRCUIT_NAME="ageProof"
CIRCUIT_DIR="$(dirname "$0")/../circuits"
BUILD_DIR="$(dirname "$0")/../build"
CONTRACTS_DIR="$(dirname "$0")/../../contracts/contracts"
PTAU_FILE="$BUILD_DIR/pot12_final.ptau"
SNARKJS="${SNARKJS_BIN:-snarkjs}"

mkdir -p "$BUILD_DIR"

echo "────────────────────────────────────────────"
echo "  Persona Circuit Compilation"
echo "  Circuit: $CIRCUIT_NAME"
echo "────────────────────────────────────────────"

# ── Step 1: Download Powers of Tau (if not present) ──────────────────────────
if [ ! -f "$PTAU_FILE" ]; then
  echo ""
  echo "[1/5] Generating Powers of Tau locally (2^12 constraints, dev-only)..."
  echo "      Note: For production, replace with a trusted multi-party ceremony ptau."
  PTAU_0000="$BUILD_DIR/pot12_0000.ptau"
  PTAU_0001="$BUILD_DIR/pot12_0001.ptau"
  # Phase 1: new ceremony
  $SNARKJS powersoftau new bn128 12 "$PTAU_0000" -v
  # Phase 1: contribute
  echo "PERSONA_PTAU_CONTRIBUTION_$(date +%s)" | \
    $SNARKJS powersoftau contribute "$PTAU_0000" "$PTAU_0001" \
      --name="Persona Dev Contribution" -v
  # Phase 1: prepare phase 2
  $SNARKJS powersoftau prepare phase2 "$PTAU_0001" "$PTAU_FILE" -v
  rm -f "$PTAU_0000" "$PTAU_0001"
  echo "      Saved to: $PTAU_FILE"
else
  echo "[1/5] Powers of Tau already present: $PTAU_FILE"
fi

# ── Step 2: Compile the Circom circuit ────────────────────────────────────────
echo ""
echo "[2/5] Compiling $CIRCUIT_NAME.circom..."
circom "$CIRCUIT_DIR/$CIRCUIT_NAME.circom" \
  --r1cs \
  --wasm \
  --sym \
  --output "$BUILD_DIR" \
  -l "$(dirname "$0")/../node_modules"

echo "      R1CS:  $BUILD_DIR/$CIRCUIT_NAME.r1cs"
echo "      WASM:  $BUILD_DIR/${CIRCUIT_NAME}_js/$CIRCUIT_NAME.wasm"
echo "      SYM:   $BUILD_DIR/$CIRCUIT_NAME.sym"

# Print constraint count
echo "      Constraints:"
$SNARKJS r1cs info "$BUILD_DIR/$CIRCUIT_NAME.r1cs"

# ── Step 3: Groth16 Setup (Phase 2 ceremony) ──────────────────────────────────
echo ""
echo "[3/5] Running Groth16 trusted setup (Phase 2)..."

ZKEY_0="$BUILD_DIR/${CIRCUIT_NAME}_0000.zkey"
ZKEY_FINAL="$BUILD_DIR/${CIRCUIT_NAME}_final.zkey"

$SNARKJS groth16 setup \
  "$BUILD_DIR/$CIRCUIT_NAME.r1cs" \
  "$PTAU_FILE" \
  "$ZKEY_0"

# Contribute randomness (single contribution — for production use a multi-party ceremony)
echo "PERSONA_PHASE2_CONTRIBUTION_$(date +%s)" | \
  $SNARKJS zkey contribute \
    "$ZKEY_0" \
    "$ZKEY_FINAL" \
    --name="Persona Phase 2 Contribution" \
    -v

echo "      ZKey: $ZKEY_FINAL"

# ── Step 4: Export Verification Key ───────────────────────────────────────────
echo ""
echo "[4/5] Exporting verification key..."
$SNARKJS zkey export verificationkey \
  "$ZKEY_FINAL" \
  "$BUILD_DIR/verification_key.json"
echo "      Verification key: $BUILD_DIR/verification_key.json"

# ── Step 5: Export Solidity Verifier ─────────────────────────────────────────
echo ""
echo "[5/5] Exporting Solidity verifier..."
$SNARKJS zkey export solidityverifier \
  "$ZKEY_FINAL" \
  "$CONTRACTS_DIR/Groth16Verifier.sol"
echo "      Solidity verifier: $CONTRACTS_DIR/Groth16Verifier.sol"

echo ""
echo "────────────────────────────────────────────"
echo "  Compilation complete!"
echo "  Next: cd ../contracts && pnpm compile && pnpm test"
echo "────────────────────────────────────────────"
