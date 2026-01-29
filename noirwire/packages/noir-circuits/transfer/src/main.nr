use dep::noirwire_circuits::transfer::{main as transfer_main, TransferPrivate, TransferPublic};

fn main(
    nullifier: pub Field,
    old_root: pub Field,
    new_root: pub Field,
    private_inputs: TransferPrivate,
) {
    let public_inputs = TransferPublic {
        nullifier,
        old_root,
        new_root,
    };
    transfer_main(public_inputs, private_inputs);
}
