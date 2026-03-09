// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IPersonaRegistry
/// @notice Interface for dApp integrations with the Persona identity protocol.
/// @dev Any dApp can call persona.isHuman(address) to verify humanity on-chain.
interface IPersonaRegistry {
    /// @notice Identity data stored per verified address.
    struct IdentityData {
        bool isHuman;
        bool isOver18;
        bytes32 countryHash;
        bytes32 uniquenessHash;
        uint64 verifiedAt;
        uint256 tokenId;
    }

    /// @notice Returns true if the account has a valid, non-revoked human proof.
    function isHuman(address account) external view returns (bool);

    /// @notice Returns true if the account has proven they are over 18.
    function isOver18(address account) external view returns (bool);

    /// @notice Returns the hashed country code for the account's ID document.
    function getCountryHash(address account) external view returns (bytes32);

    /// @notice Returns the full identity data struct for an account.
    function getIdentityData(address account) external view returns (IdentityData memory);
}
