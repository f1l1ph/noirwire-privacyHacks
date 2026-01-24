use std::hash::poseidon2::Poseidon2;
use crate::primitives::merkle::{verify_merkle_inclusion, MerkleProof};

/// Tree depth for vault member lists (16 levels = 65k max members)
global VAULT_TREE_DEPTH: u32 = 16;

/// Public inputs for vault membership proof
struct MembershipPublic {
    vault_id: Field,           // Vault identifier
    members_root: Field,       // Merkle root of member list
}

/// Private inputs for vault membership proof
struct MembershipPrivate {
    member_pubkey: Field,      // Member's public key
    member_secret: Field,      // Secret to derive pubkey
    membership_proof: MerkleProof<VAULT_TREE_DEPTH>,
}

/// Main vault membership circuit
/// Proves caller is a member of a vault without revealing which member
fn main(
    public: MembershipPublic,
    private: MembershipPrivate
) {
    // 1. Verify pubkey derivation from secret
    let derived_pubkey = Poseidon2::hash([private.member_secret], 1);
    assert(derived_pubkey == private.member_pubkey);

    // 2. Verify membership in vault tree
    // Member leaf = H(vault_id || member_pubkey)
    let member_leaf = Poseidon2::hash([public.vault_id, private.member_pubkey], 2);

    assert(verify_merkle_inclusion(
        member_leaf,
        public.members_root,
        private.membership_proof
    ));
}

#[test]
fn test_membership_proof() {
    use std::hash::poseidon2::Poseidon2;

    let vault_id = 12345;
    let member_secret = 99999;
    let member_pubkey = Poseidon2::hash([member_secret], 1);
    let member_leaf = Poseidon2::hash([vault_id, member_pubkey], 2);

    // Mock proof (3 levels for testing)
    let proof = MerkleProof {
        siblings: [200, 300, 400],
        path_indices: [0, 1, 0]
    };

    // Compute mock root
    let level1 = Poseidon2::hash([member_leaf, 200], 2);
    let level2 = Poseidon2::hash([300, level1], 2);
    let members_root = Poseidon2::hash([level2, 400], 2);

    let public = MembershipPublic {
        vault_id,
        members_root
    };

    let private = MembershipPrivate {
        member_pubkey,
        member_secret,
        membership_proof: proof
    };

    main(public, private);
}
