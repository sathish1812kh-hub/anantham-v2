import { describe, it, expect } from "vitest";
import { SsoAuthenticator } from "../../src/saas/sso-authenticator.js";

describe("PRD-SAAS-003: Single Sign-On (SSO) & Identity Federation", () => {
  const auth = new SsoAuthenticator(["https://accounts.google.com"]);

  it("validates OIDC tokens from permitted identity provider", () => {
    const payload = {
      iss: "https://accounts.google.com",
      sub: "google_user_9988",
      email: "engineer@company.com",
      name: "Lead Engineer",
    };
    const mockJwt = `header.${Buffer.from(JSON.stringify(payload)).toString("base64")}.signature`;

    const res = auth.validateFederatedToken("oidc", mockJwt);
    expect(res.valid).toBe(true);
    expect(res.identity?.email).toBe("engineer@company.com");
    expect(res.identity?.subject).toBe("google_user_9988");
  });

  it("rejects tokens from untrusted identity providers", () => {
    const payload = {
      iss: "https://evil-idp.com",
      sub: "attacker",
      email: "hacker@evil.com",
    };
    const mockJwt = `header.${Buffer.from(JSON.stringify(payload)).toString("base64")}.signature`;

    const res = auth.validateFederatedToken("oidc", mockJwt);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Unauthorized identity provider issuer");
  });

  it("validates SAML 2.0 assertions", () => {
    const samlXml = `<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"><saml:Subject>saml_user_1</saml:Subject></saml:Assertion>`;
    const res = auth.validateFederatedToken("saml", samlXml);
    expect(res.valid).toBe(true);
    expect(res.identity?.provider).toBe("saml");
  });
});
