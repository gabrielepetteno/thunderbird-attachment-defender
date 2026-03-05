# Contributing to Thunderbird Attachment Defender

Thank you for your interest in contributing! Here's how to get started.

## Reporting Bugs

Open an issue on GitHub with:
- Thunderbird version
- OS and Python version
- Steps to reproduce
- Expected vs actual behavior
- Relevant log output from `C:\PDF_Sanitizer\logs\`

## Suggesting Features

Open an issue with the `enhancement` label. Good candidates:
- Support for other attachment types (`.docx`, `.xlsx`, `.zip`)
- macOS / Linux backend scripts
- HTTPS built-in support
- Docker compose setup

## Pull Requests

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes
4. Test manually with Thunderbird in debug mode
5. Open a pull request with a clear description

## Code Style

- **Python**: PEP 8, type hints where practical
- **JavaScript**: ES2020+, async/await, no jQuery
- Keep functions small and well-commented
- No hardcoded IPs, passwords, or personal data — ever

## Security

If you discover a security vulnerability, please open a **private** issue or contact the maintainers directly rather than opening a public issue.
