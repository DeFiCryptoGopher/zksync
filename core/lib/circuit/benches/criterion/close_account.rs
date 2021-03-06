use crate::generate_accounts;
use crate::utils::ZkSyncStateGenerator;
use criterion::{black_box, criterion_group, Bencher, BenchmarkId, Criterion};
use zksync_circuit::witness::{utils::SigDataInput, Witness};
use zksync_crypto::franklin_crypto::bellman::pairing::bn256::Bn256;
use zksync_types::CloseOp;

use zksync_circuit::witness::close_account::CloseAccountWitness;

type CloseAccountWitnessBn256 = CloseAccountWitness<Bn256>;

/// Measures the time of close account apply tx
fn close_account_apply_tx(b: &mut Bencher<'_>, number_of_accounts: &usize) {
    let accounts = generate_accounts(*number_of_accounts);
    let account = &accounts[0];
    let close_account_op = CloseOp {
        tx: account.zksync_account.sign_close(None, true),
        account_id: account.id,
    };
    let (_, circuit_account_tree) = ZkSyncStateGenerator::generate(&accounts);

    let setup = || (circuit_account_tree.clone());
    b.iter_with_setup(setup, |mut circuit_account_tree| {
        CloseAccountWitnessBn256::apply_tx(&mut circuit_account_tree, &close_account_op);
    });
}

/// Measures the time of close account get pubdata
fn close_account_get_pubdata(b: &mut Bencher<'_>) {
    let accounts = generate_accounts(10);
    let account = &accounts[0];
    let close_account_op = CloseOp {
        tx: account.zksync_account.sign_close(None, true),
        account_id: account.id,
    };
    let (_, mut circuit_account_tree) = ZkSyncStateGenerator::generate(&accounts);

    let witness = CloseAccountWitnessBn256::apply_tx(&mut circuit_account_tree, &close_account_op);
    b.iter(|| {
        let _pubdata = black_box(witness.get_pubdata());
    });
}

/// Measures the time of close account calculate operations
fn close_account_calculate_operations(b: &mut Bencher<'_>) {
    let accounts = generate_accounts(10);
    let account = &accounts[0];
    let close_account_op = CloseOp {
        tx: account.zksync_account.sign_close(None, true),
        account_id: account.id,
    };
    let (_, mut circuit_account_tree) = ZkSyncStateGenerator::generate(&accounts);

    let witness = CloseAccountWitnessBn256::apply_tx(&mut circuit_account_tree, &close_account_op);
    let input =
        SigDataInput::from_close_op(&close_account_op).expect("SigDataInput creation failed");
    let setup = || (input.clone());
    b.iter_with_setup(setup, |input| {
        let _ops = black_box(witness.calculate_operations(input));
    });
}

pub fn bench_close_account_witness(c: &mut Criterion) {
    c.bench_with_input(
        BenchmarkId::new("Close account apply tx", 1usize),
        &1usize,
        close_account_apply_tx,
    );
    c.bench_with_input(
        BenchmarkId::new("Close account apply tx", 10usize),
        &10usize,
        close_account_apply_tx,
    );
    c.bench_with_input(
        BenchmarkId::new("Close account apply tx", 100usize),
        &100usize,
        close_account_apply_tx,
    );
    c.bench_function("Close account get pubdata", close_account_get_pubdata);
    c.bench_function(
        "Close account calculate operations",
        close_account_calculate_operations,
    );
}

criterion_group!(close_account_witness_benches, bench_close_account_witness);
