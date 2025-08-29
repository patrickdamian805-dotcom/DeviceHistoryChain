// tests/OwnershipTracker.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number; // number for error codes
}

interface TransferEntry {
  owner: string;
  transferTime: number;
  notes: string;
}

interface DisputeEntry {
  disputer: string;
  reason: string;
  resolved: boolean;
}

interface ContractState {
  ownershipHistory: Map<string, TransferEntry[]>;
  currentOwner: Map<string, { owner: string }>;
  disputedTransfers: Map<string, DisputeEntry>; // Key is deviceId_transferIndex
}

class OwnershipTrackerMock {
  private state: ContractState = {
    ownershipHistory: new Map(),
    currentOwner: new Map(),
    disputedTransfers: new Map(),
  };

  private ERR_NOT_REGISTERED = 10;
  private ERR_NOT_OWNER = 11;
  private ERR_INACTIVE_DEVICE = 12;
  private ERR_INVALID_NOTES = 13;
  private ERR_DISPUTED = 14;
  private MAX_NOTES_LEN = 512;
  private CONTRACT_OWNER = "deployer";

  private currentBlockHeight = 100;

  // Mock registry trait calls - assume always success for isolated testing
  private mockRegistryGetDeviceInfo(): { active: boolean } {
    return { active: true }; // Assume active
  }

  // New method to simulate device registration for testing
  registerDevice(deviceId: string, initialOwner: string): ClarityResponse<boolean> {
    if (this.state.currentOwner.has(deviceId)) {
      return { ok: false, value: this.ERR_NOT_REGISTERED }; // Device already registered
    }
    this.state.currentOwner.set(deviceId, { owner: initialOwner });
    return { ok: true, value: true };
  }

  transferOwnership(caller: string, deviceId: string, newOwner: string, notes: string): ClarityResponse<boolean> {
    const deviceInfo = this.mockRegistryGetDeviceInfo();
    const current = this.state.currentOwner.get(deviceId);
    if (!current) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    if (!deviceInfo.active) {
      return { ok: false, value: this.ERR_INACTIVE_DEVICE };
    }
    if (current.owner !== caller) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    if (notes.length > this.MAX_NOTES_LEN) {
      return { ok: false, value: this.ERR_INVALID_NOTES };
    }
    let history = this.state.ownershipHistory.get(deviceId) || [];
    history = [...history, { owner: newOwner, transferTime: this.currentBlockHeight, notes }];
    if (history.length > 100) {
      return { ok: false, value: 100 }; // Mock error for max len
    }
    this.state.ownershipHistory.set(deviceId, history);
    this.state.currentOwner.set(deviceId, { owner: newOwner });
    this.currentBlockHeight += 1;
    return { ok: true, value: true };
  }

  disputeTransfer(caller: string, deviceId: string, transferIndex: number, reason: string): ClarityResponse<boolean> {
    const history = this.state.ownershipHistory.get(deviceId);
    if (!history) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    if (transferIndex >= history.length) {
      return { ok: false, value: this.ERR_INVALID_NOTES };
    }
    const key = `${deviceId}_${transferIndex}`;
    if (this.state.disputedTransfers.has(key)) {
      return { ok: false, value: this.ERR_DISPUTED };
    }
    this.state.disputedTransfers.set(key, { disputer: caller, reason, resolved: false });
    return { ok: true, value: true };
  }

  resolveDispute(caller: string, deviceId: string, transferIndex: number, resolve: boolean): ClarityResponse<boolean> {
    const key = `${deviceId}_${transferIndex}`;
    const dispute = this.state.disputedTransfers.get(key);
    if (!dispute) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    if (caller !== this.CONTRACT_OWNER) {
      return { ok: false, value: this.ERR_NOT_OWNER };
    }
    this.state.disputedTransfers.set(key, { ...dispute, resolved: resolve });
    return { ok: true, value: true };
  }

  getOwnershipHistory(deviceId: string): ClarityResponse<TransferEntry[]> {
    return { ok: true, value: this.state.ownershipHistory.get(deviceId) || [] };
  }

  getCurrentOwner(deviceId: string): ClarityResponse<string> {
    const current = this.state.currentOwner.get(deviceId);
    if (!current) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    return { ok: true, value: current.owner };
  }

  isDisputed(deviceId: string, transferIndex: number): ClarityResponse<boolean> {
    const key = `${deviceId}_${transferIndex}`;
    const dispute = this.state.disputedTransfers.get(key);
    return { ok: true, value: !!dispute && !dispute.resolved };
  }

  getTransferCount(deviceId: string): ClarityResponse<number> {
    return { ok: true, value: (this.state.ownershipHistory.get(deviceId) || []).length };
  }
}

// Test setup
const accounts = {
  deployer: "deployer",
  user1: "wallet_1",
  user2: "wallet_2",
  user3: "wallet_3",
};

describe("OwnershipTracker Contract", () => {
  let contract: OwnershipTrackerMock;

  beforeEach(() => {
    contract = new OwnershipTrackerMock();
  });

  it("should set initial owner on first transfer (simulating registration link)", () => {
    const deviceId = "a".repeat(64);
    contract.registerDevice(deviceId, accounts.user1);
    const result = contract.transferOwnership(accounts.user1, deviceId, accounts.user2, "Sale notes");
    expect(result).toEqual({ ok: true, value: true });
    expect(contract.getCurrentOwner(deviceId)).toEqual({ ok: true, value: accounts.user2 });
    const history = contract.getOwnershipHistory(deviceId);
    expect((history.value as TransferEntry[]).length).toBe(1);
    expect((history.value as TransferEntry[])[0].owner).toBe(accounts.user2);
  });

  it("should prevent transfer by non-owner", () => {
    const deviceId = "a".repeat(64);
    contract.registerDevice(deviceId, accounts.user1);
    const result = contract.transferOwnership(accounts.user3, deviceId, accounts.user2, "Unauthorized");
    expect(result).toEqual({ ok: false, value: 11 });
  });

  it("should allow disputing a transfer", () => {
    const deviceId = "a".repeat(64);
    contract.registerDevice(deviceId, accounts.user1);
    contract.transferOwnership(accounts.user1, deviceId, accounts.user2, "Notes");
    const result = contract.disputeTransfer(accounts.user1, deviceId, 0, "Fraudulent sale");
    expect(result).toEqual({ ok: true, value: true });
    const isDisputed = contract.isDisputed(deviceId, 0);
    expect(isDisputed).toEqual({ ok: true, value: true });
  });

  it("should allow owner to resolve dispute", () => {
    const deviceId = "a".repeat(64);
    contract.registerDevice(deviceId, accounts.user1);
    contract.transferOwnership(accounts.user1, deviceId, accounts.user2, "Notes");
    contract.disputeTransfer(accounts.user1, deviceId, 0, "Reason");
    const result = contract.resolveDispute(accounts.deployer, deviceId, 0, true);
    expect(result).toEqual({ ok: true, value: true });
    const isDisputed = contract.isDisputed(deviceId, 0);
    expect(isDisputed).toEqual({ ok: true, value: false });
  });

  it("should prevent non-owner from resolving dispute", () => {
    const deviceId = "a".repeat(64);
    contract.registerDevice(deviceId, accounts.user1);
    contract.transferOwnership(accounts.user1, deviceId, accounts.user2, "Notes");
    contract.disputeTransfer(accounts.user1, deviceId, 0, "Reason");
    const result = contract.resolveDispute(accounts.user3, deviceId, 0, true);
    expect(result).toEqual({ ok: false, value: 11 });
  });

  it("should return correct transfer count", () => {
    const deviceId = "a".repeat(64);
    contract.registerDevice(deviceId, accounts.user1);
    contract.transferOwnership(accounts.user1, deviceId, accounts.user2, "First");
    contract.transferOwnership(accounts.user2, deviceId, accounts.user3, "Second");
    const count = contract.getTransferCount(deviceId);
    expect(count).toEqual({ ok: true, value: 2 });
  });

  it("should error on invalid notes length", () => {
    const deviceId = "a".repeat(64);
    contract.registerDevice(deviceId, accounts.user1);
    const longNotes = "a".repeat(513);
    const result = contract.transferOwnership(accounts.user1, deviceId, accounts.user2, longNotes);
    expect(result).toEqual({ ok: false, value: 13 });
  });
});