// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockGroth16Verifier
/// @notice Test-only verifier that always returns true.
///         Used in tests to bypass ZK proof verification without a real circuit.
///         NEVER deploy this to production.
contract MockGroth16Verifier {
    function verifyProof(
        uint256[2] memory,
        uint256[2][2] memory,
        uint256[2] memory,
        uint256[8] memory
    ) public pure returns (bool) {
        return true;
    }
}
