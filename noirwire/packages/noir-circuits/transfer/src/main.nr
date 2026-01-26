use dep::noirwire_circuits::transfer::{main as transfer_main, TransferPrivate, TransferPublic};

fn main(public: TransferPublic, private: TransferPrivate) {
    transfer_main(public, private);
}
