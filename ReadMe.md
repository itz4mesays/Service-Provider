# Service Provider

## Overview

The **Service Provider** is a backend application built with **Node.js** and **TypeScript**.
The Service Provider is the application or system that relies on the IdP for user authentication. It consumes SAML assertions from the IdP to grant users access.
---

## Table of Contents

- [How It Works](#how-it-works)
- [Prerequisites](#prerequisites)
- [What It Does](#what-it-does)
- [Installation](#installation)
- [Environment Variables](#environment-variables)
- [Running Locally](#running-locally)
- [Running Production](#running-production)

---

## What It Does:

✅ Relies on the IdP for authentication.
✅ Protects a specific application (e.g., a company’s internal HR portal).
✅ Consumes SAML assertions from the IdP to grant access.

## How it works

✅ /sso/login: Initiates the SAML login request. This will redirect you to the IdP's login page
✅ /sso/acs: Handles the SAML response from the IdP.
    1. After successful authentication, the IdP will redirect you to the SP's /sso/acs endpoint.
    2. The user data will be extracted, and the user will be redirected to the appropriate app.

---

## Prerequisites

Before running the application, ensure you have the following installed:

- **Node.js** (version 16 or higher)
- **npm** or **yarn**

---

## Installation

### 1. Clone the Repository

```bash
git clone from repository
cd into the project folder
```

```bash
run npm install
```

---

## Running locally

Starting the application locally, run 

```bash
npm run dev
```

## Running production

Starting the application production, run 

```bash
npm run prod
```

