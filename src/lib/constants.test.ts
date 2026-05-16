import { describe, expect, it } from "vitest";
import { SESSION_STATUS, SESSION_TYPES } from "./constants";

describe("constants labels", () => {
  it("keeps session status labels in Portuguese", () => {
    expect(SESSION_STATUS.scheduled.label).toBe("Agendado");
    expect(SESSION_STATUS.completed.label).toBe("Realizado");
    expect(SESSION_STATUS.cancelled.label).toBe("Cancelado");
  });

  it("keeps session type labels friendly", () => {
    expect(SESSION_TYPES.individual.label).toBe("Individual");
    expect(SESSION_TYPES.couple.label).toBe("Casal");
    expect(SESSION_TYPES.group.label).toBe("Grupo");
  });
});
