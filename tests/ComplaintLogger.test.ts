// tests/ComplaintLogger.test.ts
import { describe, expect, it, beforeEach } from "vitest";

// Interfaces for type safety
interface ClarityResponse<T> {
  ok: boolean;
  value: T | number;
}

interface Complaint {
  complainant: string;
  timestamp: number;
  complaintType: number;
  description: string;
  isInPerson: boolean;
  evidenceHash: string | null;
  escalated: boolean;
}

interface ContractState {
  complaints: Map<string, Complaint>; // Key is deviceId_complaintId
  complaintCounter: Map<string, number>;
}

class ComplaintLoggerMock {
  private state: ContractState = {
    complaints: new Map(),
    complaintCounter: new Map(),
  };

  private ERR_NOT_REGISTERED = 20;
  private ERR_NOT_AUTHORIZED = 21;
  private ERR_INVALID_TYPE = 22;
  private ERR_INVALID_DESCRIPTION = 23;
  private ERR_INVALID_EVIDENCE = 24;
  private MAX_DESCRIPTION_LEN = 512;
  private MAX_EVIDENCE_LEN = 46;

  private currentBlockHeight = 100;

  // Mock traits
  private mockRegistryIsRegistered(deviceId: string): boolean {
    return true;
  }

  private mockOwnershipGetCurrentOwner(deviceId: string): string {
    return "wallet_1"; // Mock
  }

  logComplaint(caller: string, deviceId: string, complaintType: number, description: string, isInPerson: boolean, evidenceHash: string | null): ClarityResponse<boolean> {
    const isRegistered = this.mockRegistryIsRegistered(deviceId);
    const currentOwner = this.mockOwnershipGetCurrentOwner(deviceId);
    if (!isRegistered) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    if (caller !== currentOwner) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED }; // Simplified for test
    }
    if (complaintType <= 0) {
      return { ok: false, value: this.ERR_INVALID_TYPE };
    }
    if (description.length > this.MAX_DESCRIPTION_LEN) {
      return { ok: false, value: this.ERR_INVALID_DESCRIPTION };
    }
    if (evidenceHash && evidenceHash.length > this.MAX_EVIDENCE_LEN) {
      return { ok: false, value: this.ERR_INVALID_EVIDENCE };
    }
    let count = this.state.complaintCounter.get(deviceId) || 0;
    const key = `${deviceId}_${count}`;
    this.state.complaints.set(key, {
      complainant: caller,
      timestamp: this.currentBlockHeight,
      complaintType,
      description,
      isInPerson,
      evidenceHash,
      escalated: false,
    });
    this.state.complaintCounter.set(deviceId, count + 1);
    this.currentBlockHeight += 1;
    return { ok: true, value: true };
  }

  escalateComplaint(caller: string, deviceId: string, complaintId: number): ClarityResponse<boolean> {
    const key = `${deviceId}_${complaintId}`;
    const complaint = this.state.complaints.get(key);
    if (!complaint) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    if (complaint.complainant !== caller) {
      return { ok: false, value: this.ERR_NOT_AUTHORIZED };
    }
    if (complaint.escalated) {
      return { ok: false, value: this.ERR_INVALID_TYPE };
    }
    this.state.complaints.set(key, { ...complaint, escalated: true });
    return { ok: true, value: true };
  }

  getComplaint(deviceId: string, complaintId: number): ClarityResponse<Complaint> {
    const key = `${deviceId}_${complaintId}`;
    const complaint = this.state.complaints.get(key);
    if (!complaint) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    return { ok: true, value: complaint };
  }

  getComplaintCount(deviceId: string): ClarityResponse<number> {
    return { ok: true, value: this.state.complaintCounter.get(deviceId) || 0 };
  }

  isEscalated(deviceId: string, complaintId: number): ClarityResponse<boolean> {
    const key = `${deviceId}_${complaintId}`;
    const complaint = this.state.complaints.get(key);
    if (!complaint) {
      return { ok: false, value: this.ERR_NOT_REGISTERED };
    }
    return { ok: true, value: complaint.escalated };
  }
}

// Test setup
const accounts = {
  user1: "wallet_1",
  user2: "wallet_2",
};

describe("ComplaintLogger Contract", () => {
  let contract: ComplaintLoggerMock;

  beforeEach(() => {
    contract = new ComplaintLoggerMock();
  });

  it("should log a complaint successfully", () => {
    const deviceId = "a".repeat(64);
    const result = contract.logComplaint(accounts.user1, deviceId, 1, "Device defect", true, "ipfs-hash");
    expect(result).toEqual({ ok: true, value: true });
    const count = contract.getComplaintCount(deviceId);
    expect(count).toEqual({ ok: true, value: 1 });
    const complaint = contract.getComplaint(deviceId, 0);
    expect(complaint.ok).toBe(true);
    expect((complaint.value as Complaint).description).toBe("Device defect");
    expect((complaint.value as Complaint).evidenceHash).toBe("ipfs-hash");
  });

  it("should prevent unauthorized logging", () => {
    const deviceId = "a".repeat(64);
    const result = contract.logComplaint(accounts.user2, deviceId, 1, "Unauthorized", false, null);
    expect(result).toEqual({ ok: false, value: 21 });
  });

  it("should allow escalating a complaint", () => {
    const deviceId = "a".repeat(64);
    contract.logComplaint(accounts.user1, deviceId, 1, "Issue", false, null);
    const result = contract.escalateComplaint(accounts.user1, deviceId, 0);
    expect(result).toEqual({ ok: true, value: true });
    const escalated = contract.isEscalated(deviceId, 0);
    expect(escalated).toEqual({ ok: true, value: true });
  });

  it("should prevent escalating already escalated complaint", () => {
    const deviceId = "a".repeat(64);
    contract.logComplaint(accounts.user1, deviceId, 1, "Issue", false, null);
    contract.escalateComplaint(accounts.user1, deviceId, 0);
    const result = contract.escalateComplaint(accounts.user1, deviceId, 0);
    expect(result).toEqual({ ok: false, value: 22 });
  });

  it("should error on invalid description length", () => {
    const deviceId = "a".repeat(64);
    const longDesc = "a".repeat(513);
    const result = contract.logComplaint(accounts.user1, deviceId, 1, longDesc, true, null);
    expect(result).toEqual({ ok: false, value: 23 });
  });

  it("should error on invalid evidence hash length", () => {
    const deviceId = "a".repeat(64);
    const longHash = "a".repeat(47);
    const result = contract.logComplaint(accounts.user1, deviceId, 1, "Desc", true, longHash);
    expect(result).toEqual({ ok: false, value: 24 });
  });
});