use dep::noirwire_circuits::deposit::{DepositPrivate, DepositPublic, main as deposit_main};

fn main(
    deposit_amount: pub Field,
    new_commitment: pub Field,
    leaf_index: pub Field,
    old_root: pub Field,
    new_root: pub Field,
    private_inputs: DepositPrivate,
) {
    let public_inputs = DepositPublic {
        deposit_amount,
        new_commitment,
        leaf_index,
        old_root,
        new_root,
    };
    deposit_main(public_inputs, private_inputs);
}
