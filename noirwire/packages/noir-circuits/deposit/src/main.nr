use dep::noirwire_circuits::deposit::{DepositPrivate, DepositPublic, main as deposit_main};

fn main(public: DepositPublic, private: DepositPrivate) {
    deposit_main(public, private);
}
