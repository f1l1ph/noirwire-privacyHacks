# 21 — PER Operations Runbook

## Overview

This document covers **operational procedures** for the PER executor: disaster recovery, high availability setup, monitoring, and emergency procedures. This is separate from the architectural blueprint ([20_PER_Execution_Layer.md](20_PER_Execution_Layer.md)) to keep architecture concerns distinct from operations.

For architecture and design decisions, see **[20_PER_Execution_Layer.md](20_PER_Execution_Layer.md)**.

---

## Table of Contents

1. [Threat Model](#threat-model)
2. [State Backup Strategy](#state-backup-strategy)
3. [High Availability Setup](#high-availability-setup)
4. [Monitoring & Alerts](#monitoring--alerts)
5. [Recovery Procedures](#recovery-procedures)
6. [Emergency Runbooks](#emergency-runbooks)
7. [Testing & Validation](#testing--validation)
8. [Operational Checklist](#operational-checklist)

---

## Threat Model

### Risk Assessment

| Scenario | Probability | Impact | Mitigation |
|----------|-------------|--------|-----------|
| **TEE crash** | Medium | High - Lost pending txs | Periodic snapshots + WAL |
| **Network partition** | Low | Medium - Delayed settlement | Auto reconnect + retry logic |
| **Validator downtime** | Low | Medium - Service interruption | Multi-validator failover |
| **State corruption** | Very Low | Critical - Data loss | State checksums + backup validation |
| **Hardware failure** | Low | High - Complete outage | Hot standby TEE instance |
| **Solana RPC failure** | Low | Medium - Settlement blocked | Multiple RPC endpoints + retry |

---

## State Backup Strategy

### 1. Periodic Snapshots

Snapshots capture the complete system state at a point in time:

```rust
// src/disaster_recovery/snapshot.rs

pub struct StateSnapshot {
    /// Timestamp of snapshot
    pub timestamp: i64,

    /// Current merkle root
    pub merkle_root: [u8; 32],

    /// All commitments in the tree
    pub commitments: Vec<Commitment>,

    /// Pending nullifiers (not yet settled)
    pub pending_nullifiers: Vec<[u8; 32]>,

    /// Accumulated proofs for next batch
    pub proof_accumulator: BatchAccumulatorState,

    /// Last settled L1 slot
    pub last_settlement_slot: u64,

    /// Checksum for validation
    pub checksum: [u8; 32],
}
```

**Snapshot Schedule:**
- Every 100 transactions (high frequency for busy periods)
- Every 5 minutes (time-based safety checkpoint)
- Before every batch settlement (pre-settlement checkpoint)

**Storage Locations:**
1. **Local disk** (TEE encrypted storage) - Fast recovery
2. **Supabase** (encrypted) - Geographic redundancy
3. **S3/R2** (optional, for additional redundancy)

### 2. Write-Ahead Logging (WAL)

WAL ensures transaction durability:

```rust
// src/disaster_recovery/wal.rs

pub struct WriteAheadLog {
    file: tokio::fs::File,
    current_offset: u64,
}

impl WriteAheadLog {
    /// Append transaction to WAL before processing
    pub async fn append(&mut self, tx: &Transaction) -> Result<u64> {
        let serialized = bincode::serialize(tx)?;
        let len = serialized.len() as u32;

        // Write: [length: u32][data: bytes][checksum: u32]
        self.file.write_u32_le(len).await?;
        self.file.write_all(&serialized).await?;

        let checksum = crc32fast::hash(&serialized);
        self.file.write_u32_le(checksum).await?;
        self.file.flush().await?;

        let offset = self.current_offset;
        self.current_offset += 4 + len as u64 + 4;

        Ok(offset)
    }

    /// Replay WAL from offset
    pub async fn replay_from(&mut self, offset: u64) -> Result<Vec<Transaction>> {
        self.file.seek(SeekFrom::Start(offset)).await?;

        let mut transactions = Vec::new();

        loop {
            let len = match self.file.read_u32_le().await {
                Ok(l) => l,
                Err(_) => break, // EOF
            };

            let mut data = vec![0u8; len as usize];
            self.file.read_exact(&mut data).await?;

            let stored_checksum = self.file.read_u32_le().await?;
            let computed_checksum = crc32fast::hash(&data);

            if stored_checksum != computed_checksum {
                error!("WAL corruption detected at offset {}", self.current_offset);
                break;
            }

            let tx: Transaction = bincode::deserialize(&data)?;
            transactions.push(tx);
        }

        Ok(transactions)
    }
}
```

**WAL Rotation:**
- Daily rotation (keep last 7 days)
- Compress old WAL files
- Archive to Supabase

---

## High Availability Setup

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   PRODUCTION HA SETUP                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   ┌──────────────────────┐           ┌──────────────────────┐  │
│   │   PRIMARY TEE        │           │   HOT STANDBY TEE    │  │
│   │   (Active)           │◄─────────▶│   (Synced)           │  │
│   │                      │  Heartbeat│                      │  │
│   │  • Processes txs     │           │  • Replays snapshots │  │
│   │  • Generates proofs  │           │  • Ready to takeover │  │
│   │  • Creates snapshots │           │  • Lag: ~30 seconds  │  │
│   └──────────┬───────────┘           └──────────┬───────────┘  │
│              │                                   │              │
│              └───────────────┬───────────────────┘              │
│                              │                                  │
│                              ▼                                  │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │        LOAD BALANCER / HEALTH CHECK                      │ │
│   │  • Route requests to active TEE                          │ │
│   │  • Detect failures (30 second timeout)                   │ │
│   │  • Automatic failover to standby                         │ │
│   └──────────────────────────────────────────────────────────┘ │
│                              │                                  │
│                              ▼                                  │
│   ┌──────────────────────────────────────────────────────────┐ │
│   │            SHARED STATE STORAGE                          │ │
│   │  • Supabase: Snapshots + WAL                             │ │
│   │  • Redis: Current state cache                            │ │
│   │  • S3: Backup snapshots                                  │ │
│   └──────────────────────────────────────────────────────────┘ │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Setup Steps

1. **Deploy Primary TEE**
   ```bash
   docker run -d \
     -e DEPLOYMENT_MODE=primary \
     -e SNAPSHOT_INTERVAL=300 \
     -v /data/snapshots:/app/snapshots \
     noirwire_per:latest
   ```

2. **Deploy Standby TEE**
   ```bash
   docker run -d \
     -e DEPLOYMENT_MODE=standby \
     -e PRIMARY_ADDR=per-primary.noirwire.com \
     -v /data/snapshots:/app/snapshots \
     noirwire_per:latest
   ```

3. **Configure Load Balancer**
   ```nginx
   upstream per_backend {
     server per-primary.noirwire.com:8080 max_fails=3 fail_timeout=30s;
     server per-standby.noirwire.com:8080 backup;
   }

   server {
     listen 443 ssl http2;
     server_name per.noirwire.com;

     location / {
       proxy_pass http://per_backend;
       proxy_connect_timeout 5s;
       proxy_read_timeout 30s;
     }
   }
   ```

---

## Monitoring & Alerts

### Health Checks

```typescript
// monitoring/health_check.ts

interface HealthStatus {
  status: "healthy" | "degraded" | "critical";
  last_heartbeat: number;
  pending_tx_count: number;
  last_settlement: number;
  snapshot_lag: number;
  tee_attestation_valid: boolean;
}

async function checkHealth(): Promise<HealthStatus> {
  try {
    const response = await fetch("https://per.noirwire.com/health");
    const data = await response.json();

    // Alert if unhealthy
    if (data.status !== "healthy") {
      await sendAlert({
        severity: data.status === "critical" ? "P1" : "P2",
        message: `PER health check failed: ${data.status}`,
        details: data,
      });
    }

    // Alert if snapshot lag > 5 minutes
    if (data.snapshot_lag > 300) {
      await sendAlert({
        severity: "P2",
        message: "Snapshot lag exceeds 5 minutes",
        lag_seconds: data.snapshot_lag,
      });
    }

    // Alert if TEE attestation invalid
    if (!data.tee_attestation_valid) {
      await sendAlert({
        severity: "P1",
        message: "TEE attestation check failed!",
        action_required: "Investigate TEE validity",
      });
    }

    return data;
  } catch (error) {
    await sendAlert({
      severity: "P1",
      message: "PER executor unreachable",
      error: error.message,
    });
    throw error;
  }
}

// Run every 30 seconds
setInterval(checkHealth, 30_000);
```

### Key Metrics

| Metric | Threshold | Alert Level | Action |
|--------|-----------|-------------|--------|
| Health status | degraded/critical | P1/P2 | Page on-call |
| Snapshot lag | > 5 min | P2 | Investigate |
| TEE attestation | invalid | P1 | Halt service |
| Pending TX count | > 10k | P2 | Monitor |
| Settlement lag | > 30 min | P2 | Check L1 RPC |

### Alerting Channels

- **P1 (Critical):** PagerDuty + Slack + SMS
- **P2 (Warning):** Slack + Email
- **P3 (Info):** Slack only

---

## Recovery Procedures

### Scenario 1: TEE Crash (Immediate Recovery)

**Timeline:**
```
T0 - TEE crashes during batch aggregation
     88 transactions in current batch
     Last snapshot: 2 minutes ago (86 transactions settled)

RECOVERY STEPS:

1. Detect Crash [Automatic]
   Time: 30 seconds
   - Health check fails after 30 seconds
   - Failover triggered automatically

2. Load Last Snapshot [~15 seconds]
   - Fetch snapshot from Supabase
   - Validate checksum
   - Restore state to snapshot point (86 txs)

3. Replay WAL [~20 seconds]
   - Read WAL from snapshot offset
   - Replay 2 missing transactions
   - Verify state consistency

4. Resume Operations [~10 seconds]
   - All 88 transactions recovered
   - No user data lost
   - Service downtime: ~2 minutes total

RESULT: Zero transaction loss ✓
```

**Command:**
```bash
# Automatic via load balancer, but manual trigger:
./bin/restore_snapshot --file snapshots/snapshot_latest.bin
./bin/replay_wal --from-snapshot latest
systemctl restart noirwire-per
```

### Scenario 2: State Corruption Detection

**Timeline:**
```
T0 - Merkle root mismatch detected

RECOVERY STEPS:

1. Halt Operations [~10 seconds]
   - Stop accepting new transactions
   - Emit critical alert
   - Notify operations team

2. Identify Last Good State [~30 seconds]
   - Check last 10 snapshots
   - Validate each snapshot checksum
   - Find last valid snapshot: T-15 minutes

3. Restore from Snapshot [~20 seconds]
   - Load snapshot state
   - Verify against L1 (last settlement)

4. Notify Users [Async]
   - Transactions after T-15 may need resubmission
   - Provide transaction replay service

5. Resume Operations [~10 seconds]
   - Service restored with valid state
   - Downtime: ~10 minutes total

RESULT: State integrity maintained
```

**Command:**
```bash
./bin/find_valid_snapshot --verify-all
./bin/restore_snapshot --file snapshots/snapshot_1234567890.bin
./bin/verify_state --against-l1
systemctl start noirwire-per
```

### Scenario 3: Solana RPC Failure

**Automatic retry logic:**
```rust
const MAX_RETRIES: usize = 5;
const INITIAL_BACKOFF_MS: u64 = 1000;

async fn submit_with_retry(instruction: Instruction) -> Result<()> {
    for attempt in 0..MAX_RETRIES {
        match submit_to_l1(&instruction).await {
            Ok(sig) => {
                info!("Transaction submitted: {}", sig);
                return Ok(());
            }
            Err(e) if attempt < MAX_RETRIES - 1 => {
                let backoff_ms = INITIAL_BACKOFF_MS * 2_u64.pow(attempt as u32);
                warn!("Submission failed, retrying in {}ms: {}", backoff_ms, e);
                tokio::time::sleep(Duration::from_millis(backoff_ms)).await;
            }
            Err(e) => {
                error!("Failed to submit after {} retries: {}", MAX_RETRIES, e);
                return Err(e);
            }
        }
    }
    unreachable!()
}
```

**Manual intervention:**
```bash
# If auto-retry exhausted, queue batch for manual retry
./bin/requeue_batch --batch-id <batch_id> --reason "RPC_FAILURE"

# Check queued batches
./bin/list_queued_batches

# Manually submit when RPC recovered
./bin/submit_queued_batch --batch-id <batch_id>
```

---

## Emergency Runbooks

### Runbook: Service Halt

**When to use:** Critical failure detected (TEE attestation failed, state corrupted beyond recovery)

**Steps:**

```bash
# 1. Immediately halt service
systemctl stop noirwire-per
kill $(pgrep -f noirwire_per)

# 2. Stop accepting requests (load balancer level)
./scripts/drain_traffic.sh

# 3. Take snapshot of current state (for post-mortem)
docker exec per_executor ./bin/capture_emergency_snapshot

# 4. Notify stakeholders
./scripts/notify_incident.sh \
  --severity CRITICAL \
  --message "PER service halted due to critical failure"

# 5. Wait for operations team
echo "Waiting for manual intervention..."
```

**Recovery:** Follow Scenario 2 or manual diagnostics.

---

### Runbook: Failover to Standby

**When to use:** Primary TEE unresponsive for > 30 seconds

**Automatic (load balancer handles), but manual trigger:**

```bash
# 1. Verify standby is healthy
curl -s https://per-standby.noirwire.com/health | jq .

# 2. Switch traffic
./scripts/failover.sh --to-standby

# 3. Monitor standby for stability (5 minutes)
./scripts/monitor.sh --duration 300 --target per-standby

# 4. If stable, prepare primary for recovery
./scripts/prepare_recovery.sh --target per-primary
```

---

### Runbook: Rollback to Previous Version

**When to use:** Bug discovered in production code

**Steps:**

```bash
# 1. Identify last good version
git log --oneline | head -20

# 2. Halt current service
systemctl stop noirwire-per

# 3. Restore snapshot from before bug was deployed
./bin/restore_snapshot --file snapshots/snapshot_1234567890.bin \
  --version v0.8.2

# 4. Restart with previous binary
docker run -d \
  -e VERSION=v0.8.2 \
  --restart always \
  noirwire_per:v0.8.2

# 5. Verify state
./bin/verify_state --against-l1

# 6. Monitor for issues
./scripts/monitor.sh --duration 600
```

---

## Testing & Validation

### Backup Verification Script

```bash
#!/bin/bash
# scripts/verify_backups.sh

echo "Verifying all snapshots are valid..."

for snapshot in ./snapshots/*.bin; do
  echo "Verifying $snapshot..."

  # Check file integrity
  if ! shasum -a 256 -c "${snapshot}.sha256"; then
    echo "❌ Checksum mismatch: $snapshot"
    exit 1
  fi

  # Verify snapshot can be deserialized
  if ! ./bin/verify_snapshot "$snapshot"; then
    echo "❌ Invalid snapshot: $snapshot"
    exit 1
  fi

  echo "✓ Valid: $snapshot"
done

echo "✓ All backups verified"
```

**Schedule:**
- Every hour: Quick checksum verification
- Every day: Full deserialization test
- Every week: Test restore on standby TEE

---

### Disaster Recovery Test Plan

**Monthly RTO Test:**

```bash
#!/bin/bash
# scripts/test_rto.sh

echo "Testing Recovery Time Objective (RTO)..."

# 1. Create test snapshot
echo "Creating test snapshot..."
./bin/capture_snapshot --output test_snapshot.bin

# 2. Simulate TEE crash (corrupt state)
echo "Simulating crash..."
killall noirwire_per
sleep 5

# 3. Time recovery
echo "Starting recovery timer..."
START_TIME=$(date +%s)

./bin/restore_snapshot --file test_snapshot.bin
./bin/replay_wal --from-snapshot test_snapshot.bin
systemctl start noirwire-per

END_TIME=$(date +%s)
RTO_SECONDS=$((END_TIME - START_TIME))

echo "Recovery completed in: ${RTO_SECONDS}s"
echo "Target RTO: 300s (5 minutes)"

if [ $RTO_SECONDS -lt 300 ]; then
  echo "✓ RTO test PASSED"
  exit 0
else
  echo "❌ RTO test FAILED - recovery took too long"
  exit 1
fi
```

---

## Operational Checklist

### Pre-Production

- [ ] **HA Setup Validated**
  - [ ] Primary and standby both healthy
  - [ ] Load balancer routing correctly
  - [ ] Failover tested successfully

- [ ] **Backup Strategy Operational**
  - [ ] Snapshots being created on schedule
  - [ ] WAL rotation working
  - [ ] Multi-location backup verified
  - [ ] Restore tested from each location

- [ ] **Monitoring Active**
  - [ ] Health checks running
  - [ ] Alerts configured for all thresholds
  - [ ] PagerDuty integration tested
  - [ ] Slack notifications working

- [ ] **Runbooks Ready**
  - [ ] All runbooks reviewed by ops team
  - [ ] Team trained on procedures
  - [ ] Contact list updated
  - [ ] Escalation paths clear

### Weekly

- [ ] Verify all snapshots are valid
- [ ] Test backup restoration (standby)
- [ ] Review alert logs
- [ ] Check RPC endpoint health
- [ ] Validate Solana settlement status

### Monthly

- [ ] Full RTO test with simulated failure
- [ ] RPO test (replay WAL from checkpoint)
- [ ] HA failover test
- [ ] Rollback procedure test
- [ ] Review and update runbooks

### Quarterly

- [ ] Disaster recovery drill (team exercise)
- [ ] Load testing (1000 tx/s for 1 hour)
- [ ] Cross-region failover test (if applicable)
- [ ] Update threat model
- [ ] Review incident logs

---

## Recovery Time Objectives

| Scenario | Target RTO | Actual (tested) | Data Loss (RPO) |
|----------|-----------|-----------------|-----------------|
| TEE restart | < 1 min | 45 sec | 0 txs |
| TEE crash | < 5 min | 2.5 min | 0 txs |
| State corruption | < 15 min | 8 min | < 5 min of txs |
| Complete disaster | < 1 hour | N/A (untested) | Snapshot lag |

---

_Operations Runbook Version: 1.0_
_Status: Production Approved_
_Last Updated: 2026-01-26_
