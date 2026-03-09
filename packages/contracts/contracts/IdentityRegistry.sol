// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPersonaRegistry} from "./interfaces/IPersonaRegistry.sol";
import {Groth16Verifier} from "./Groth16Verifier.sol";
import {PersonaToken} from "./PersonaToken.sol";

/// @title IdentityRegistry
/// @notice Core contract of the Persona protocol. Verifies ZK proofs of identity and stores
///         privacy-preserving identity flags on-chain.
///
/// @dev Verification flow:
///   1. User generates a Groth16 proof off-chain (in the browser / mobile app) from their ID document.
///   2. User submits the proof to `verify()`.
///   3. `Groth16Verifier` validates the proof cryptographically.
///   4. Public signals are decoded: isHuman, isOver18, countryHash, uniquenessHash, nullifier.
///   5. The nullifier is checked against `_usedNullifiers` to prevent the same identity from
///      registering multiple times (even with different wallets).
///   6. Identity data is stored, PersonaToken is minted to the caller.
///
/// @notice Public signals layout (uint256[8], from ageProof.circom Phase 2):
///   [0] isOver18       — 1 if age >= minAge (full date-aware), 0 otherwise
///   [1] nullifier      — Poseidon(secret): anti-Sybil uniqueness commitment
///   [2] countryHash    — Poseidon(countryCode): which country issued the document
///   [3] uniquenessHash — Poseidon(idNumber, secret): ties this ID to this secret
///   [4] currentYear    — public input, not stored on-chain
///   [5] currentMonth   — public input, not stored on-chain
///   [6] currentDay     — public input, not stored on-chain
///   [7] minAge         — public input, not stored on-chain
contract IdentityRegistry is IPersonaRegistry, Ownable {
    // ── Errors ────────────────────────────────────────────────────────────────

    error InvalidProof();
    error AlreadyVerified();
    error NullifierUsed();
    error ZeroAddress();
    error NotVerified();

    // ── Events ────────────────────────────────────────────────────────────────

    event IdentityVerified(
        address indexed account,
        bytes32 indexed nullifier,
        uint256 indexed tokenId,
        uint64 timestamp
    );
    event IdentityRevoked(address indexed account, uint256 indexed tokenId);

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice The ZK proof verifier contract.
    Groth16Verifier public immutable verifier;

    /// @notice The Soulbound Token contract.
    PersonaToken public immutable token;

    /// @notice Identity data per address. Only non-zero after successful verification.
    mapping(address => IdentityData) private _identities;

    /// @notice Tracks used nullifiers to prevent duplicate registrations across wallets.
    /// @dev Nullifier = Poseidon(secret), where secret is derived from the ID document.
    mapping(bytes32 => bool) private _usedNullifiers;

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param _verifier Address of the deployed Groth16Verifier.
    /// @param _token    Address of the deployed PersonaToken (SBT).
    /// @param _owner    Initial owner / admin (multisig in production).
    constructor(
        address _verifier,
        address _token,
        address _owner
    ) Ownable(_owner) {
        if (_verifier == address(0) || _token == address(0)) revert ZeroAddress();
        verifier = Groth16Verifier(_verifier);
        token = PersonaToken(_token);
    }

    // ── Core: Verify Identity ─────────────────────────────────────────────────

    /// @notice Submits a ZK proof to verify the caller's identity.
    /// @dev The proof must have been generated from a valid government-issued ID document.
    ///      The caller's address is NOT part of the circuit — anyone can submit a proof
    ///      to their own wallet. The nullifier prevents the same real-world identity
    ///      from registering to multiple wallets.
    /// @param a       Groth16 proof element A (G1 point).
    /// @param b       Groth16 proof element B (G2 point).
    /// @param c       Groth16 proof element C (G1 point).
    /// @param input   Public signals: [isOver18, nullifier, countryHash, uniquenessHash,
    ///                                  currentYear, currentMonth, currentDay, minAge].
    function verify(
        uint256[2] calldata a,
        uint256[2][2] calldata b,
        uint256[2] calldata c,
        uint256[8] calldata input
    ) external {
        address account = msg.sender;

        // Check not already verified
        if (_identities[account].isHuman) revert AlreadyVerified();

        // Verify the ZK proof
        if (!verifier.verifyProof(a, b, c, input)) revert InvalidProof();

        // Decode public signals
        bool _isOver18          = input[0] == 1;
        bytes32 _nullifier      = bytes32(input[1]);
        bytes32 _countryHash    = bytes32(input[2]);
        bytes32 _uniquenessHash = bytes32(input[3]);
        // input[4..7] are currentYear/Month/Day/minAge — consumed by circuit, not stored

        // Enforce uniqueness across wallets
        if (_usedNullifiers[_nullifier]) revert NullifierUsed();
        _usedNullifiers[_nullifier] = true;

        // Mint the SBT
        uint256 tokenId = token.mint(account);

        // Store identity
        _identities[account] = IdentityData({
            isHuman: true,
            isOver18: _isOver18,
            countryHash: _countryHash,
            uniquenessHash: _uniquenessHash,
            verifiedAt: uint64(block.timestamp),
            tokenId: tokenId
        });

        emit IdentityVerified(account, _nullifier, tokenId, uint64(block.timestamp));
    }

    // ── Admin: Revoke Identity ────────────────────────────────────────────────

    /// @notice Revokes a verified identity. Only callable by the owner.
    /// @dev Burns the SBT and clears the identity data. The nullifier is NOT cleared,
    ///      so the same real-world identity cannot re-register.
    /// @param account The address whose identity to revoke.
    function revokeIdentity(address account) external onlyOwner {
        IdentityData storage id = _identities[account];
        if (!id.isHuman) revert NotVerified();

        uint256 tokenId = id.tokenId;

        // Clear identity data
        delete _identities[account];

        // Burn the SBT
        token.burn(tokenId);

        emit IdentityRevoked(account, tokenId);
    }

    // ── IPersonaRegistry Implementation ──────────────────────────────────────

    /// @inheritdoc IPersonaRegistry
    function isHuman(address account) external view returns (bool) {
        return _identities[account].isHuman;
    }

    /// @inheritdoc IPersonaRegistry
    function isOver18(address account) external view returns (bool) {
        return _identities[account].isOver18;
    }

    /// @inheritdoc IPersonaRegistry
    function getCountryHash(address account) external view returns (bytes32) {
        return _identities[account].countryHash;
    }

    /// @inheritdoc IPersonaRegistry
    function getIdentityData(address account) external view returns (IdentityData memory) {
        return _identities[account];
    }

    // ── View Helpers ──────────────────────────────────────────────────────────

    /// @notice Returns true if the given nullifier has already been used.
    function isNullifierUsed(bytes32 nullifier) external view returns (bool) {
        return _usedNullifiers[nullifier];
    }
}
