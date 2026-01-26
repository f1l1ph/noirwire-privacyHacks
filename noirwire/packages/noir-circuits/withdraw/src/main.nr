use dep::noirwire_circuits::withdraw::{main as withdraw_main, WithdrawPrivate, WithdrawPublic};

fn main(public: WithdrawPublic, private: WithdrawPrivate) {
    withdraw_main(public, private);
}
