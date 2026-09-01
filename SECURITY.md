# Security Policy 🔒

## Supported Versions
We actively maintain and provide security updates for the following release:

| Version | Supported |
|---------|-----------|
| v2.2.1  | ✅ Current |
| < v2.2.0 | ❌ Not supported |

---

## Reporting a Vulnerability
If you discover a security issue, please help us keep the community safe:

- **Do not open a public issue.**
- Instead, email us at **jha.santosh.1216@gmail.com**.
- Include:
  - A clear description of the vulnerability
  - Steps to reproduce
  - Potential impact
  - Suggested fix (if any)

We will acknowledge receipt within **48 hours** and provide updates until the issue is resolved.

---

## Security Best Practices for Contributors
- Validate all **JSON inputs** (`puzzle.json`) to prevent malformed data.
- Avoid unsafe DOM manipulation in `script.js`.
- Sanitize user-generated content before rendering in `index.html`.
- Keep dependencies updated and avoid introducing unnecessary libraries.
- Do not commit secrets, API keys, or credentials.

---

## Disclosure Policy
- We follow **responsible disclosure**: vulnerabilities will be fixed before public announcement.
- Contributors who report issues responsibly will be credited in release notes.

---

## Contact
For urgent security concerns, please reach out to:  
📧 **jha.santosh.1216@gmail.com**

---

## Notes
- Current stable release: **v2.2.1**
- Next planned release: **v2.3.0** (security patches will be included)
