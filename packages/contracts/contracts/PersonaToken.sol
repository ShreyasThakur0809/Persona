// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title PersonaToken
/// @notice Non-transferable Soulbound Token (SBT) representing a verified human identity.
///         One token per address. Minted by IdentityRegistry upon successful ZK proof verification.
///         Burns are only triggered by IdentityRegistry on revocation.
/// @dev Transfer functions are disabled (soulbound). Token metadata is fully on-chain and contains
///      NO personally identifiable information — only boolean identity flags.
contract PersonaToken is ERC721, Ownable {
    using Strings for uint256;

    // ── Errors ────────────────────────────────────────────────────────────────

    error SoulboundToken();
    error AlreadyMinted();
    error OnlyRegistry();
    error ZeroAddress();
    error RegistryAlreadySet();

    // ── Events ────────────────────────────────────────────────────────────────

    event PersonaMinted(address indexed to, uint256 indexed tokenId);
    event PersonaBurned(uint256 indexed tokenId);
    event RegistrySet(address indexed registry);

    // ── State ─────────────────────────────────────────────────────────────────

    /// @notice The IdentityRegistry contract authorized to mint and burn tokens.
    address public identityRegistry;

    /// @dev Counter for token IDs (starts at 1).
    uint256 private _tokenIdCounter;

    // ── Constructor ───────────────────────────────────────────────────────────

    /// @param initialOwner Admin address (multisig in production).
    constructor(address initialOwner) ERC721("Persona Human Token", "PHT") Ownable(initialOwner) {}

    // ── Admin ─────────────────────────────────────────────────────────────────

    /// @notice Sets the IdentityRegistry address. Can only be called once by the owner.
    /// @dev Called after IdentityRegistry is deployed to wire up the two contracts.
    function setRegistry(address registry) external onlyOwner {
        if (registry == address(0)) revert ZeroAddress();
        if (identityRegistry != address(0)) revert RegistryAlreadySet();
        identityRegistry = registry;
        emit RegistrySet(registry);
    }

    // ── Mint / Burn ───────────────────────────────────────────────────────────

    /// @notice Mints a Persona Human Token to `to`. Only callable by the IdentityRegistry.
    /// @param to The address receiving the token.
    /// @return tokenId The newly minted token ID.
    function mint(address to) external returns (uint256 tokenId) {
        if (msg.sender != identityRegistry) revert OnlyRegistry();
        if (to == address(0)) revert ZeroAddress();
        if (balanceOf(to) > 0) revert AlreadyMinted();

        unchecked {
            tokenId = ++_tokenIdCounter;
        }

        _mint(to, tokenId);
        emit PersonaMinted(to, tokenId);
    }

    /// @notice Burns a token on identity revocation. Only callable by the IdentityRegistry.
    /// @param tokenId The token to burn.
    function burn(uint256 tokenId) external {
        if (msg.sender != identityRegistry) revert OnlyRegistry();
        _burn(tokenId);
        emit PersonaBurned(tokenId);
    }

    // ── Metadata ──────────────────────────────────────────────────────────────

    /// @notice Returns fully on-chain JSON metadata for the token. Contains NO PII.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);

        string memory json = string.concat(
            '{"name":"Persona Human Token #',
            tokenId.toString(),
            '","description":"A non-transferable Soulbound Token proving humanity and identity attributes verified via zero-knowledge proof on the Persona protocol.","image":"data:image/svg+xml;base64,',
            _buildSVG(tokenId),
            '","attributes":[{"trait_type":"Protocol","value":"Persona"},{"trait_type":"Chain","value":"Monad"},{"trait_type":"Verified","value":"true"}]}'
        );

        return string.concat("data:application/json;base64,", Base64.encode(bytes(json)));
    }

    /// @dev Builds a minimal on-chain SVG for the token.
    function _buildSVG(uint256 tokenId) internal pure returns (string memory) {
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400">',
            '<rect width="400" height="400" fill="#0a0a0a"/>',
            '<circle cx="200" cy="160" r="60" fill="none" stroke="#836EF9" stroke-width="3"/>',
            '<text x="200" y="168" font-family="monospace" font-size="14" fill="#836EF9" text-anchor="middle">VERIFIED HUMAN</text>',
            '<text x="200" y="260" font-family="monospace" font-size="12" fill="#666" text-anchor="middle">Persona #',
            tokenId.toString(),
            '</text>',
            '<text x="200" y="290" font-family="monospace" font-size="10" fill="#444" text-anchor="middle">Monad Blockchain</text>',
            '</svg>'
        );
        return Base64.encode(bytes(svg));
    }

    // ── Soulbound: Disable All Transfers ──────────────────────────────────────

    function transferFrom(address, address, uint256) public pure override {
        revert SoulboundToken();
    }

    function safeTransferFrom(address, address, uint256, bytes memory) public pure override {
        revert SoulboundToken();
    }

    function approve(address, uint256) public pure override {
        revert SoulboundToken();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert SoulboundToken();
    }

    // ── View Helpers ──────────────────────────────────────────────────────────

    /// @notice Returns the total number of tokens ever minted.
    function totalMinted() external view returns (uint256) {
        return _tokenIdCounter;
    }
}
