import request from "supertest";
import jwt from "jsonwebtoken";
import { createApp } from "../../server/src/app";
import type { Application } from "express";

let _app: Application | null = null;
const getApp = () => {
  if (!_app) _app = createApp();
  return _app;
};

const PROTECTED = "/api/patients"; // any authenticated endpoint

describe("Authentication security", () => {
  test("missing Authorization header → 401", async () => {
    const res = await request(getApp()).get(PROTECTED);
    expect(res.status).toBe(401);
  });

  test("malformed Bearer token → 401", async () => {
    const res = await request(getApp())
      .get(PROTECTED)
      .set("Authorization", "Bearer this.is.not.a.JWT");
    expect(res.status).toBe(401);
  });

  test("tampered JWT signature → 401", async () => {
    const validParts = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0";
    const tamperedToken = validParts + ".INVALIDSIGNATURE";

    const res = await request(getApp())
      .get(PROTECTED)
      .set("Authorization", `Bearer ${tamperedToken}`);
    expect(res.status).toBe(401);
  });

  test("expired JWT → 401", async () => {
    const secret = process.env["JWT_SECRET"] ?? "test-secret";
    const expiredToken = jwt.sign(
      { sub: "1", role: "patient", iat: Math.floor(Date.now() / 1000) - 7200 },
      secret,
      { expiresIn: -1 },
    );

    const res = await request(getApp())
      .get(PROTECTED)
      .set("Authorization", `Bearer ${expiredToken}`);
    expect(res.status).toBe(401);
  });

  test("wrong password → 401", async () => {
    const res = await request(getApp())
      .post("/api/auth/login")
      .send({
        email: "patient1@helixhealthportal.test",
        password: "WRONGPASSWORD",
      });
    expect(res.status).toBe(401);
  });

  test("non-existent account → 401 (not 500)", async () => {
    const res = await request(getApp())
      .post("/api/auth/login")
      .send({
        email: "nobody@helixhealthportal.test",
        password: "TestPass123!",
      });
    expect(res.status).toBe(401);
  });

  test("wrong password response does not reveal whether account exists", async () => {
    const existingRes = await request(getApp())
      .post("/api/auth/login")
      .send({ email: "patient1@helixhealthportal.test", password: "WRONG" });

    const nonExistingRes = await request(getApp())
      .post("/api/auth/login")
      .send({ email: "ghost@helixhealthportal.test", password: "WRONG" });

    // Both responses should have the same structure to prevent account enumeration
    expect(existingRes.body.error).toBe(nonExistingRes.body.error);
  });
});
