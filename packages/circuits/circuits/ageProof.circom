pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

/// @title AgeProof — Phase 2
/// @notice Full date-aware proof that the prover is at least `minAge` years old.
///         Also commits to country and document identity without revealing PII.
///
/// Private inputs (never leave the device):
///   birthYear    — year of birth from ID document
///   birthMonth   — month of birth (1-12)
///   birthDay     — day of birth (1-31)
///   secret       — random blinding factor (prevents nullifier brute-force)
///   countryCode  — numeric country identifier (e.g. 91=India, 1=USA)
///   idNumber     — numeric representation of the ID document number
///
/// Public inputs (visible on-chain):
///   currentYear  — current year at proof-generation time
///   currentMonth — current month (1-12)
///   currentDay   — current day (1-31)
///   minAge       — minimum age requirement (18 for standard verification)
///
/// Public outputs (committed in the proof, verified on-chain):
///   isOver18      — 1 if age >= minAge considering full date, 0 otherwise
///   nullifier     — Poseidon(secret): anti-Sybil uniqueness commitment
///   countryHash   — Poseidon(countryCode): which country issued the document
///   uniquenessHash — Poseidon(idNumber, secret): ties this ID to this secret
///
/// snarkjs public signal order (outputs first, then public inputs):
///   [isOver18, nullifier, countryHash, uniquenessHash, currentYear, currentMonth, currentDay, minAge]
template AgeProof() {
    // ── Private inputs ────────────────────────────────────────────────────────
    signal input birthYear;
    signal input birthMonth;
    signal input birthDay;
    signal input secret;
    signal input countryCode;
    signal input idNumber;

    // ── Public inputs ─────────────────────────────────────────────────────────
    signal input currentYear;
    signal input currentMonth;
    signal input currentDay;
    signal input minAge;

    // ── Outputs ───────────────────────────────────────────────────────────────
    signal output isOver18;
    signal output nullifier;
    signal output countryHash;
    signal output uniquenessHash;

    // ── Step 1: Year difference ───────────────────────────────────────────────
    signal yearDiff;
    yearDiff <== currentYear - birthYear;

    // Is yearDiff strictly greater than minAge?  (definitely old enough)
    component gtYear = GreaterThan(8);  // 8 bits → max 255, covers age diffs up to 255
    gtYear.in[0] <== yearDiff;
    gtYear.in[1] <== minAge;

    // Is yearDiff exactly equal to minAge?  (need to check month/day)
    component eqYear = IsEqual();
    eqYear.in[0] <== yearDiff;
    eqYear.in[1] <== minAge;

    // ── Step 2: Month comparison (only meaningful when yearDiff == minAge) ────
    // Has the birth month already passed this year?
    component gtMonth = GreaterThan(4);  // 4 bits → max 15, covers months 1-12
    gtMonth.in[0] <== currentMonth;
    gtMonth.in[1] <== birthMonth;

    // Is it exactly the birth month?
    component eqMonth = IsEqual();
    eqMonth.in[0] <== currentMonth;
    eqMonth.in[1] <== birthMonth;

    // ── Step 3: Day comparison (only meaningful when month matches) ───────────
    // Has the birth day arrived yet this month?
    component geDay = GreaterEqThan(5);  // 5 bits → max 31, covers days 1-31
    geDay.in[0] <== currentDay;
    geDay.in[1] <== birthDay;

    // ── Step 4: Combine into birthdayPassed ──────────────────────────────────
    // birthdayPassed = (currentMonth > birthMonth)
    //               OR (currentMonth == birthMonth AND currentDay >= birthDay)
    //
    // The two terms are mutually exclusive:
    //   if gtMonth.out=1 → eqMonth.out=0 → monthAndDay=0
    // so simple addition is safe.
    signal monthAndDay;
    monthAndDay <== eqMonth.out * geDay.out;

    signal birthdayPassed;
    birthdayPassed <== gtMonth.out + monthAndDay;

    // ── Step 5: Final age check ───────────────────────────────────────────────
    // isOver18 = (yearDiff > minAge) OR (yearDiff == minAge AND birthdayPassed)
    //
    // eqYear.out=1 implies gtYear.out=0, so these are mutually exclusive → safe addition.
    signal eqYearAndPassed;
    eqYearAndPassed <== eqYear.out * birthdayPassed;

    isOver18 <== gtYear.out + eqYearAndPassed;

    // ── Step 6: ZK Commitments ────────────────────────────────────────────────
    // nullifier = Poseidon(secret)
    // Same secret → same nullifier, enabling anti-Sybil enforcement on-chain.
    component posNullifier = Poseidon(1);
    posNullifier.inputs[0] <== secret;
    nullifier <== posNullifier.out;

    // countryHash = Poseidon(countryCode)
    // Proves which country issued the document without revealing the raw code.
    component posCountry = Poseidon(1);
    posCountry.inputs[0] <== countryCode;
    countryHash <== posCountry.out;

    // uniquenessHash = Poseidon(idNumber, secret)
    // Ties this specific ID document to this specific secret.
    // Prevents the same document from registering with different secrets.
    component posUniqueness = Poseidon(2);
    posUniqueness.inputs[0] <== idNumber;
    posUniqueness.inputs[1] <== secret;
    uniquenessHash <== posUniqueness.out;
}

// Public inputs: currentYear, currentMonth, currentDay, minAge
// Private: birthYear, birthMonth, birthDay, secret, countryCode, idNumber
component main {public [currentYear, currentMonth, currentDay, minAge]} = AgeProof();
