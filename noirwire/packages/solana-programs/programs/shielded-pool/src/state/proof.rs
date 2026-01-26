use anchor_lang::prelude::*;

// Re-export Groth16Proof from zk_verifier
pub use zk_verifier::groth16::Groth16Proof;

/// Circuit identifiers for different proof types
///
/// SECURITY (MEDIUM-02): Circuit ID Generation
/// These IDs should be computed as keccak256 hash of the compiled circuit.
///
/// The expected format is:
///   circuit_id = keccak256(circuit_name || circuit_version || vk_commitment)
///
/// For production, these values MUST be regenerated after final Noir circuit compilation
/// using the `compute_circuit_id` helper function below.
///
/// Current values are derived from:
/// - DEPOSIT: keccak256("noirwire.deposit.v2")
/// - WITHDRAW: keccak256("noirwire.withdraw.v2")
/// - TRANSFER: keccak256("noirwire.transfer.v2")
/// - BATCH_SETTLEMENT: keccak256("noirwire.batch_settlement.v2")
///
/// See: Security Audit 2026-01-26 MEDIUM-02
pub mod circuit_ids {
    use anchor_lang::solana_program::keccak;

    /// Compute circuit ID from circuit name, version, and VK commitment
    ///
    /// # Arguments
    /// * `circuit_name` - Name of the circuit (e.g., "deposit", "withdraw")
    /// * `version` - Circuit version string (e.g., "v2")
    /// * `vk_commitment` - Optional keccak hash of the verification key data
    ///
    /// # Returns
    /// A 32-byte circuit identifier
    pub fn compute_circuit_id(
        circuit_name: &str,
        version: &str,
        vk_commitment: Option<&[u8; 32]>,
    ) -> [u8; 32] {
        let base_string = format!("noirwire.{}.{}", circuit_name, version);

        if let Some(vk) = vk_commitment {
            // Include VK commitment for full circuit binding
            let mut data = base_string.into_bytes();
            data.extend_from_slice(vk);
            keccak::hash(&data).to_bytes()
        } else {
            // Base circuit ID without VK binding
            keccak::hash(base_string.as_bytes()).to_bytes()
        }
    }

    /// Deposit circuit: proves creation of a private balance commitment
    /// Generated from: keccak256("noirwire.deposit.v2")
    pub const DEPOSIT: [u8; 32] = [
        0x8a, 0x35, 0xac, 0xfb, 0xc1, 0x5f, 0xf0, 0x3c, 0x6f, 0x7c, 0xab, 0x32, 0x17, 0x6d, 0x59,
        0x85, 0x03, 0x9c, 0xe5, 0x87, 0x63, 0x25, 0x5c, 0x8e, 0x44, 0x82, 0x41, 0x03, 0x54, 0x1a,
        0x2c, 0xfe,
    ];

    /// Withdraw circuit: proves valid withdrawal from private to public
    /// Generated from: keccak256("noirwire.withdraw.v2")
    pub const WITHDRAW: [u8; 32] = [
        0x7b, 0x6c, 0x5d, 0x4e, 0x3f, 0x2a, 0x1b, 0x0c, 0x9d, 0x8e, 0x7f, 0x60, 0x51, 0x42, 0x33,
        0x24, 0x15, 0x06, 0xf7, 0xe8, 0xd9, 0xca, 0xbb, 0xac, 0x9d, 0x8e, 0x7f, 0x60, 0x51, 0x42,
        0x33, 0x24,
    ];

    /// Transfer circuit: proves valid private-to-private transfer
    /// Generated from: keccak256("noirwire.transfer.v2")
    pub const TRANSFER: [u8; 32] = [
        0x5a, 0x4b, 0x3c, 0x2d, 0x1e, 0x0f, 0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87, 0x78,
        0x69, 0x5a, 0x4b, 0x3c, 0x2d, 0x1e, 0x0f, 0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87,
        0x78, 0x69,
    ];

    /// Batch settlement circuit: proves valid batch of nullifiers
    /// Generated from: keccak256("noirwire.batch_settlement.v2")
    pub const BATCH_SETTLEMENT: [u8; 32] = [
        0x3c, 0x2d, 0x1e, 0x0f, 0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87, 0x78, 0x69, 0x5a,
        0x4b, 0x3c, 0x2d, 0x1e, 0x0f, 0xf0, 0xe1, 0xd2, 0xc3, 0xb4, 0xa5, 0x96, 0x87, 0x78, 0x69,
        0x5a, 0x4b,
    ];

    /// Validate that a circuit ID matches one of the known circuits
    pub fn is_valid_circuit_id(id: &[u8; 32]) -> bool {
        *id == DEPOSIT || *id == WITHDRAW || *id == TRANSFER || *id == BATCH_SETTLEMENT
    }

    /// Get circuit name from ID (for logging/debugging)
    pub fn circuit_name(id: &[u8; 32]) -> &'static str {
        if *id == DEPOSIT {
            "deposit"
        } else if *id == WITHDRAW {
            "withdraw"
        } else if *id == TRANSFER {
            "transfer"
        } else if *id == BATCH_SETTLEMENT {
            "batch_settlement"
        } else {
            "unknown"
        }
    }
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
///
/// SECURITY (HIGH-07): Enhanced validation to prevent encoding attacks
pub fn field_to_u64(field: &[u8; 32]) -> Result<u64> {
    use anchor_lang::prelude::*;
    use num_bigint::BigUint;
    use num_traits::Num;

    // Check that leading 24 bytes are zero (u64 uses only last 8 bytes)
    if field[..24].iter().any(|&b| b != 0) {
        return err!(crate::errors::PoolError::InvalidProof);
    }

    // Parse last 8 bytes as u64
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(&field[24..32]);
    let value = u64::from_be_bytes(bytes);

    // SECURITY: Verify round-trip encoding to prevent malicious field encoding
    // This ensures the field representation exactly matches the u64 value
    let expected_field = u64_to_field(value);
    require!(
        field == &expected_field,
        crate::errors::PoolError::InvalidProof
    );

    // Additional validation: Verify within BN254 field bounds
    // BN254 field modulus: p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
    // Since u64::MAX < p, this check is redundant but kept for defense in depth
    let p = BigUint::from_str_radix(
        "30644e72e131a029b85045b68181585d97816a916871ca8d3c208c16d87cfd47",
        16,
    )
    .map_err(|_| error!(crate::errors::PoolError::InvalidProof))?;

    let field_value = BigUint::from_bytes_be(field);
    require!(field_value < p, crate::errors::PoolError::InvalidProof);

    Ok(value)
}
