# ProofOfNeed: product proposal

**Chosen idea from the list:** Age / Eligibility Gate, "prove a threshold without revealing the underlying value".

**Repository:** https://github.com/themlie/stellarMidnight-ProofOfNeed
**Live demo:** https://stellar-midnight-proof-of-need-sfh6.vercel.app/
**Contract (Midnight Preprod):** `6ec4f7700d5ae009284841ceab24340e6601fec42b0f12a9bbb48f9ae85e3d44`

## Problem

Need-based scholarships decide one thing: is the applicant's family income below a limit? To answer it, foundations today collect the full picture: exact income, occupations, employers, sometimes payslips and tax records. That data is then stored by every foundation a student applies to, and read by the people processing the application.

This hurts in two ways. It is far more personal data than the decision needs, kept in more places than necessary. And for many families, laying their finances out in front of a stranger is humiliating enough that some eligible students do not apply at all.

## Solution

ProofOfNeed turns the income check into a zero-knowledge eligibility gate on Midnight.

1. The foundation deploys a contract with its income threshold. The threshold is public, because the rule should be transparent.
2. The student enters their family income in the dApp. It stays on their machine as a private witness.
3. The dApp proves `income < threshold` and submits only the proof and a yes/no result. The foundation, and anyone else watching the chain, learns whether the student qualifies and nothing about the number.
4. Each application also publishes an anonymous nullifier derived from a secret only the student holds. The contract refuses a second application from the same secret, so a student cannot apply twice or retry with a lower number after a rejection, and the nullifier does not reveal who they are.

## Why it fits "Age / Eligibility Gate"

The item asks to prove a threshold without revealing the underlying value. That is exactly the contract's circuit: the underlying value is family income, the threshold is the foundation's limit, and `disclose()` is applied only to the boolean result of the comparison. Age gates are the textbook version of this pattern. Income eligibility is a version where the hidden value is more sensitive and the privacy benefit to the user is larger.

## How it uses Midnight's privacy model

| | What | Visibility |
|---|---|---|
| Public ledger | threshold, number of checks, number of eligible checks, set of nullifiers | Everyone |
| Circuit result | eligible or not | Everyone |
| Private witnesses | family income, student secret | Only the student's machine |

An observer can learn the threshold, how many students applied, how many qualified, and one anonymous nullifier with a yes/no result per application. They cannot learn any income, how far above or below the threshold a student was, or which person or wallet an application belongs to. The Compact compiler rejects writing the income or the secret to the ledger without `disclose()`, so an accidental leak is caught at compile time.

## Current status

Built during the program and running on Midnight Preprod:

- Compact contract with income and student secret as private witnesses, a nullifier set for one application per student, and public counters.
- 10 contract tests and 22 application tests, run by GitHub Actions on every push together with a check that the committed compiled circuits match the source.
- Browser dApp (Vite, Midnight SDK, Lace DApp connector) that connects Lace on Preprod, proves through Lace's prover, reads the public ledger live, and shows after each proof what left the browser (the transaction is searched for the income and the secret).
- On-chain use: eligible and not-eligible applications have been submitted to the Preprod contract, and a repeat application from the same student is refused.

## Roadmap

- **Foundation controls:** only the foundation can change the threshold or open and close an application round, proven with a commitment to a foundation secret rather than a public key on the ledger.
- **Verified income:** accept only incomes signed by a trusted issuer (for example an e-Devlet income statement), verified inside the circuit, so students cannot simply type a lower number. Binding the nullifier secret to the same credential makes "one application per person" hold across browsers and devices.
- **Payouts:** let donors fund the contract and pay eligible students a monthly stipend, without linking the payment to the income proof.
- **Pilot:** onboard a small foundation and a group of student testers on Preprod, collect feedback, and then launch on Mainnet.

## Known limits today

- The income is self-declared until verified income credentials are added.
- The student secret lives in the browser's local storage, so a determined person with several browsers can apply more than once. The nullifier already prevents accidental and casual repeats.
- Proving happens on the student's machine through a local proof server, which is an extra setup step for users until wallets bundle proving.
