use dep::noirwire_circuits::withdraw::{main as withdraw_main, WithdrawPrivate, WithdrawPublic};

fn main(
    amount: pub Field,
    recipient: pub Field,
    nullifier: pub Field,
    old_root: pub Field,
    new_root: pub Field,
    private_inputs: WithdrawPrivate,
) {
    let public_inputs = WithdrawPublic {
        amount,
        recipient,
        nullifier,
        old_root,
        new_root,
    };
    withdraw_main(public_inputs, private_inputs);
}
