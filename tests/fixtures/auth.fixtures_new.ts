export interface TestUser {
  email: string;
  password: string;
  role: "patient" | "provider" | "admin";
  expectedRedirect: string;
}

export const testUsers: {
  patient: TestUser;
  provider: TestUser;
  admin: TestUser;
  wrongPassword: TestUser;
} = {
  patient: {
    email: process.env.TEST_PATIENT_EMAIL ?? "patient1@helixhealthportal.test",
    password: process.env.TEST_PATIENT_PASSWORD ?? "TestPass123!",
    role: "patient",
    expectedRedirect: "/dashboard",
  },
  provider: {
    email: process.env.TEST_PROVIDER_EMAIL ?? "provider@helixhealthportal.test",
    password: process.env.TEST_PROVIDER_PASSWORD ?? "TestPass123!",
    role: "provider",
    expectedRedirect: "/dashboard",
  },
  admin: {
    email: process.env.TEST_ADMIN_EMAIL ?? "admin@helixhealthportal.test",
    password: process.env.TEST_ADMIN_PASSWORD ?? "TestPass123!",
    role: "admin",
    expectedRedirect: "/dashboard",
  },
  // A real account that exists in the test environment but has the wrong password used against it
  wrongPassword: {
    email: process.env.TEST_PATIENT_EMAIL ?? "patient@example.com",
    password: "definitelyWrongPassword!",
    role: "patient",
    expectedRedirect: "/login",
  },
};
