# DeviceHistoryChain

## Overview

DeviceHistoryChain is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It addresses real-world problems in the resale market for devices (e.g., smartphones, laptops, vehicles, or appliances) by providing an immutable, transparent ledger of a device's history. Buyers often face risks like hidden defects, unreported repairs, or fraudulent claims due to centralized or opaque records. This project solves these issues by:

- **Immutability**: All logs (ownership transfers, complaints, resolutions) are stored on-chain, preventing tampering.
- **Transparency**: Potential buyers can query the full history of a device before purchase, reducing fraud and building trust in secondary markets.
- **Decentralized Verification**: No single entity controls the data; anyone can verify via blockchain explorers.
- **Incentivization**: Optional token rewards for honest reporting and resolutions.
- **Real-World Integration**: Supports logging virtual (e.g., online support tickets) and in-person (e.g., service center visits) interactions.

This fosters a fairer resale ecosystem, potentially increasing device longevity and reducing e-waste by encouraging better maintenance tracking. The project involves 6 core smart contracts, designed for security, efficiency, and composability on Stacks.

## Tech Stack

- **Blockchain**: Stacks (Layer 1 on Bitcoin for security and finality).
- **Smart Contract Language**: Clarity (decidable, secure, and predictable).
- **Deployment**: Use Stacks CLI for deployment to testnet/mainnet.
- **Frontend Integration**: Can be paired with a dApp (e.g., using React and @stacks/connect) for user interactions like registering devices or logging complaints.
- **Off-Chain Components**: IPFS for storing detailed resolution documents (hashes stored on-chain for immutability).

## Smart Contracts

The project consists of 6 Clarity smart contracts, each handling a specific aspect of the device history lifecycle. Contracts are modular, with clear traits for interoperability. Below is a high-level description, including key functions and rationale. Full code is in the `contracts/` directory.

### 1. DeviceRegistry.clar
   - **Purpose**: Registers unique devices and manages basic metadata. Ensures each device has a unique ID (e.g., hashed serial number) to prevent duplicates.
   - **Key Functions**:
     - `register-device (device-id: principal, metadata: (string-ascii 256))`: Registers a new device; only callable by the owner.
     - `get-device-metadata (device-id: principal)`: Retrieves metadata (e.g., model, manufacture date).
     - `is-registered (device-id: principal)`: Checks if a device exists.
   - **Traits/Interfaces**: Implements a `device-trait` for querying existence.
   - **Rationale**: Acts as the entry point; prevents spam by requiring STX fees for registration.

### 2. OwnershipTracker.clar
   - **Purpose**: Tracks ownership transfers immutably, logging each resale or transfer event.
   - **Key Functions**:
     - `transfer-ownership (device-id: principal, new-owner: principal)`: Transfers ownership; requires current owner's signature.
     - `get-ownership-history (device-id: principal)`: Returns a list of past owners and transfer timestamps.
     - `get-current-owner (device-id: principal)`: Fetches the current owner.
   - **Traits/Interfaces**: Uses `device-trait` from DeviceRegistry for validation.
   - **Rationale**: Essential for resale transparency; buyers can trace provenance to detect stolen or disputed devices.

### 3. ComplaintLogger.clar
   - **Purpose**: Logs user complaints (e.g., defects, malfunctions) with timestamps and details. Supports virtual (e.g., app-based) and in-person (e.g., store visit) logs.
   - **Key Functions**:
     - `log-complaint (device-id: principal, complaint-type: uint, description: (string-ascii 512), is-in-person: bool)`: Logs a complaint; callable by current or past owners.
     - `get-complaints (device-id: principal)`: Retrieves all complaints for a device, sorted by timestamp.
     - `count-complaints (device-id: principal)`: Returns the total number of complaints.
   - **Traits/Interfaces**: Integrates with OwnershipTracker to verify caller permissions.
   - **Rationale**: Captures issues early, helping buyers assess risk (e.g., frequent complaints indicate poor quality).

### 4. ResolutionRecorder.clar
   - **Purpose**: Records resolutions to complaints, including fixes, refunds, or dismissals. Links to IPFS for evidence (e.g., repair receipts).
   - **Key Functions**:
     - `record-resolution (device-id: principal, complaint-id: uint, resolution-type: uint, ipfs-hash: (string-ascii 46))`: Adds a resolution; requires verifier (e.g., service provider) approval.
     - `get-resolutions (device-id: principal)`: Fetches all resolutions, linked to complaints.
     - `is-resolved (complaint-id: uint)`: Checks if a complaint has been resolved.
   - **Traits/Interfaces**: References ComplaintLogger for complaint validation.
   - **Rationale**: Closes the loop on complaints, showing if issues were addressed, which builds buyer confidence.

### 5. HistoryVerifier.clar
   - **Purpose**: Provides aggregated views and verifications of a device's full history for easy querying.
   - **Key Functions**:
     - `get-full-history (device-id: principal)`: Compiles ownership, complaints, and resolutions into a single tuple.
     - `verify-integrity (device-id: principal)`: Checks for unresolved complaints or suspicious patterns (e.g., frequent transfers).
     - `export-history (device-id: principal)`: Generates a hashed summary for off-chain sharing.
   - **Traits/Interfaces**: Composes traits from all other contracts for read-only access.
   - **Rationale**: Simplifies dApp integrations; buyers can quickly verify without manual aggregation.

### 6. IncentiveToken.clar
   - **Purpose**: Manages a fungible token (e.g., DHT token) to incentivize honest reporting and resolutions (e.g., rewards for verified fixes).
   - **Key Functions**:
     - `mint-tokens (amount: uint, recipient: principal)`: Mints tokens; restricted to contract owner or governance.
     - `transfer (amount: uint, sender: principal, recipient: principal)`: Standard FT transfer.
     - `reward-resolution (device-id: principal, complaint-id: uint, amount: uint)`: Rewards the resolver upon successful resolution.
   - **Traits/Interfaces**: SIP-010 compliant for fungible tokens; integrates with ResolutionRecorder.
   - **Rationale**: Encourages participation; e.g., service centers earn tokens for resolutions, solving low-engagement issues in decentralized systems.

## Deployment and Usage

1. **Install Dependencies**: Use Stacks CLI (`stacks-cli install`).
2. **Deploy Contracts**:
   - Deploy in order: DeviceRegistry → OwnershipTracker → ComplaintLogger → ResolutionRecorder → HistoryVerifier → IncentiveToken.
   - Example: `clarinet deploy --testnet`.
3. **Interact via dApp**:
   - Register a device.
   - Transfer ownership during resale.
   - Log complaints and resolutions.
   - Query history before buying.
4. **Testing**: Use Clarinet for unit tests (see `tests/` directory). Covers edge cases like invalid transfers or unresolved complaints.
5. **Security Considerations**:
   - All functions use `tx-sender` for authorization.
   - No unbounded loops (Clarity's design prevents this).
   - Audits recommended before mainnet.

## Potential Impact

- **Solves Fraud in Resale**: E.g., in used electronics markets (valued at $50B+ globally), buyers avoid lemons.
- **Environmental Benefits**: Better tracking promotes repairs over disposal.
- **Scalability**: Stacks' Bitcoin anchoring ensures low-cost, secure transactions.
- **Future Extensions**: Integrate with NFTs for device representation or oracles for automated verifications.

## License

MIT License. See `LICENSE` for details.