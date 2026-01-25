use anchor_lang::prelude::*;

// Re-export Groth16Proof from zk_verifier
pub use zk_verifier::groth16::Groth16Proof;

/// Circuit identifiers for different proof types
pub mod circuit_ids {
    /// Deposit circuit: proves creation of a private balance commitment
    pub const DEPOSIT: [u8; 32] = [
        0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
    ];

    /// Withdraw circuit: proves valid withdrawal from private to public
    pub const WITHDRAW: [u8; 32] = [
        0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
    ];

    /// Transfer circuit: proves valid private-to-private transfer
    pub const TRANSFER: [u8; 32] = [
        0x03, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
    ];

    /// Batch settlement circuit: proves valid batch of nullifiers
    pub const BATCH_SETTLEMENT: [u8; 32] = [
        0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00,
    ];
}

/// Proof data for deposit operation
/// Public inputs: [deposit_amount, new_commitment, leaf_index, old_root, new_root]
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct DepositProofData {
    /// Groth16 proof (A, B, C points on BN254)
    pub proof: Groth16Proof,
    /// Public input: amount being deposited (converted from u64)
    pub deposit_amount: [u8; 32],
    /// Public input: commitment hash for the new balance
    pub new_commitment: [u8; 32],
    /// Public input: index where leaf is inserted in merkle tree
    pub leaf_index: [u8; 32],
    /// Public input: merkle root before insertion
    pub old_root: [u8; 32],
    /// Public input: merkle root after insertion
    pub new_root: [u8; 32],
}

impl DepositProofData {
    /// Extract public inputs as array for verification
    /// Must match the order expected by Groth16 verification
    pub fn public_inputs(&self) -> Vec<[u8; 32]> {
        vec![
            self.deposit_amount,
            self.new_commitment,
            self.leaf_index,
            self.old_root,
            self.new_root,
        ]
    }
}

/// Proof data for withdrawal operation
/// Public inputs: [amount, recipient, nullifier, old_root, new_root]
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct WithdrawProofData {
    /// Groth16 proof (A, B, C points on BN254)
    pub proof: Groth16Proof,
    /// Public input: amount being withdrawn
    pub amount: [u8; 32],
    /// Public input: recipient address (L1)
    pub recipient: [u8; 32],
    /// Public input: nullifier for double-spend protection
    pub nullifier: [u8; 32],
    /// Public input: merkle root before withdrawal
    pub old_root: [u8; 32],
    /// Public input: merkle root after withdrawal (nullifier leaf zeroed)
    pub new_root: [u8; 32],
}

impl WithdrawProofData {
    /// Extract public inputs as array for verification
    pub fn public_inputs(&self) -> Vec<[u8; 32]> {
        vec![
            self.amount,
            self.recipient,
            self.nullifier,
            self.old_root,
            self.new_root,
        ]
    }
}

/// Proof data for private transfer operation
/// Public inputs: [amount, sender_old_root, sender_new_root, receiver_old_root, receiver_new_root]
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct TransferProofData {
    /// Groth16 proof
    pub proof: Groth16Proof,
    /// Public input: amount being transferred
    pub amount: [u8; 32],
    /// Public input: sender's merkle root before transfer
    pub sender_old_root: [u8; 32],
    /// Public input: sender's merkle root after transfer
    pub sender_new_root: [u8; 32],
    /// Public input: receiver's merkle root before transfer
    pub receiver_old_root: [u8; 32],
    /// Public input: receiver's merkle root after transfer
    pub receiver_new_root: [u8; 32],
}

impl TransferProofData {
    /// Extract public inputs as array for verification
    pub fn public_inputs(&self) -> Vec<[u8; 32]> {
        vec![
            self.amount,
            self.sender_old_root,
            self.sender_new_root,
            self.receiver_old_root,
            self.receiver_new_root,
        ]
    }
}

/// Proof data for batch settlement operation
/// Public inputs: [old_root, new_root, nullifiers_root, nullifier_count]
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct BatchSettlementProofData {
    /// Groth16 proof
    pub proof: Groth16Proof,
    /// Public input: old merkle root
    pub old_root: [u8; 32],
    /// Public input: new merkle root after all withdrawals
    pub new_root: [u8; 32],
    /// Public input: merkle root of all nullifiers in the batch
    pub nullifiers_root: [u8; 32],
    /// Public input: number of nullifiers in the batch
    pub nullifier_count: [u8; 32],
}

impl BatchSettlementProofData {
    /// Extract public inputs as array for verification
    pub fn public_inputs(&self) -> Vec<[u8; 32]> {
        vec![
            self.old_root,
            self.new_root,
            self.nullifiers_root,
            self.nullifier_count,
        ]
    }
}

/// Helper function to convert u64 to big-endian [u8; 32]
pub fn u64_to_field(value: u64) -> [u8; 32] {
    let mut result = [0u8; 32];
    result[24..32].copy_from_slice(&value.to_be_bytes());
    result
}

/// Helper function to convert u32 to big-endian [u8; 32]
pub fn u32_to_field(value: u32) -> [u8; 32] {
    let mut result = [0u8; 32];
    result[28..32].copy_from_slice(&value.to_be_bytes());
    result
}

/// Helper function to convert field [u8; 32] back to u64
/// Assumes the field was created with u64_to_field
/// Validates that the value is within BN254 field bounds
pub fn field_to_u64(field: &[u8; 32]) -> Result<u64> {
    use anchor_lang::prelude::*;
    use num_bigint::BigUint;
    use num_traits::Num;

    // Check that leading bytes are zero
    if field[..24].iter().any(|&b| b != 0) {
        return err!(crate::errors::PoolError::InvalidProof);
    }

    // BN254 field modulus: p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
    // In hex: 30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47
    let p = BigUint::from_str_radix(
        "30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47",
        16,
    )
    .map_err(|_| error!(crate::errors::PoolError::InvalidProof))?;

    // Verify the value is within BN254 field
    let value = BigUint::from_bytes_be(field);
    require!(value < p, crate::errors::PoolError::InvalidProof);

    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&field[24..32]);
    Ok(u64::from_be_bytes(bytes))
}
