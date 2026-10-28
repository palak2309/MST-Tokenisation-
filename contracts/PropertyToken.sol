// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title PropertyToken
/// @notice Fractional units for tokenised properties. One ERC-1155 token ID per property.
/// @dev Holding units does NOT transfer legal title to any real estate. The on-chain
///      unit-price reference is informational only and is not a guaranteed market price.
///      Only identifiers and document hashes are stored; never documents or personal data.
contract PropertyToken is ERC1155Supply, AccessControl, Pausable {
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    struct Property {
        bytes32 propertyRef; // keccak256 of the off-chain property ID (e.g. "PRP-PUN-0142")
        bytes32 documentHash; // SHA-256 of the approved tokenisation document bundle
        uint256 maxSupply; // fixed at registration, cannot be changed
        uint256 unitPriceReference; // informational, smallest currency unit (e.g. paise)
        string metadataURI;
        uint64 registeredAt;
        bool transfersEnabled; // secondary transfers off by default
    }

    uint256 public nextTokenId = 1;
    mapping(uint256 => Property) private _properties;
    mapping(bytes32 => uint256) public tokenIdByPropertyRef;
    mapping(address => bool) public isEligibleInvestor;

    event PropertyRegistered(
        uint256 indexed tokenId,
        bytes32 indexed propertyRef,
        bytes32 documentHash,
        uint256 maxSupply,
        uint256 unitPriceReference,
        string metadataURI
    );
    event UnitsIssued(uint256 indexed tokenId, address indexed to, uint256 amount, address indexed issuer);
    event InvestorEligibilityUpdated(address indexed investor, bool eligible, address indexed by);
    event TransfersEnabledUpdated(uint256 indexed tokenId, bool enabled, address indexed by);

    error InvalidPropertyRef();
    error InvalidDocumentHash();
    error InvalidMaxSupply();
    error PropertyAlreadyRegistered(uint256 tokenId);
    error UnknownToken(uint256 tokenId);
    error ZeroAmount();
    error InvalidRecipient(address to);
    error SupplyCapExceeded(uint256 tokenId, uint256 requested, uint256 remaining);
    error TransfersDisabled(uint256 tokenId);
    error IneligibleInvestor(address account);

    constructor(address admin) ERC1155("") {
        if (admin == address(0)) revert InvalidRecipient(admin);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------- Registration and issuance ----------

    function registerProperty(
        bytes32 propertyRef,
        bytes32 documentHash,
        uint256 maxSupply,
        uint256 unitPriceReference,
        string calldata metadataURI
    ) external onlyRole(ISSUER_ROLE) whenNotPaused returns (uint256 tokenId) {
        if (propertyRef == bytes32(0)) revert InvalidPropertyRef();
        if (documentHash == bytes32(0)) revert InvalidDocumentHash();
        if (maxSupply == 0) revert InvalidMaxSupply();
        uint256 existing = tokenIdByPropertyRef[propertyRef];
        if (existing != 0) revert PropertyAlreadyRegistered(existing);

        tokenId = nextTokenId++;
        tokenIdByPropertyRef[propertyRef] = tokenId;
        _properties[tokenId] = Property({
            propertyRef: propertyRef,
            documentHash: documentHash,
            maxSupply: maxSupply,
            unitPriceReference: unitPriceReference,
            metadataURI: metadataURI,
            registeredAt: uint64(block.timestamp),
            transfersEnabled: false
        });
        emit PropertyRegistered(tokenId, propertyRef, documentHash, maxSupply, unitPriceReference, metadataURI);
    }

    function issueUnits(uint256 tokenId, address to, uint256 amount) external onlyRole(ISSUER_ROLE) whenNotPaused {
        Property storage p = _properties[tokenId];
        if (p.maxSupply == 0) revert UnknownToken(tokenId);
        if (amount == 0) revert ZeroAmount();
        if (to == address(0) || to == address(this)) revert InvalidRecipient(to);
        if (!isEligibleInvestor[to]) revert IneligibleInvestor(to);
        uint256 remaining = p.maxSupply - totalSupply(tokenId);
        if (amount > remaining) revert SupplyCapExceeded(tokenId, amount, remaining);

        _mint(to, tokenId, amount, "");
        emit UnitsIssued(tokenId, to, amount, msg.sender);
    }

    // ---------- Compliance controls ----------

    function setInvestorEligibility(address investor, bool eligible) external onlyRole(COMPLIANCE_ROLE) {
        if (investor == address(0)) revert InvalidRecipient(investor);
        isEligibleInvestor[investor] = eligible;
        emit InvestorEligibilityUpdated(investor, eligible, msg.sender);
    }

    function setTransfersEnabled(uint256 tokenId, bool enabled) external onlyRole(COMPLIANCE_ROLE) {
        if (_properties[tokenId].maxSupply == 0) revert UnknownToken(tokenId);
        _properties[tokenId].transfersEnabled = enabled;
        emit TransfersEnabledUpdated(tokenId, enabled, msg.sender);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // ---------- Views ----------

    function getProperty(uint256 tokenId) external view returns (Property memory) {
        if (_properties[tokenId].maxSupply == 0) revert UnknownToken(tokenId);
        return _properties[tokenId];
    }

    function remainingSupply(uint256 tokenId) external view returns (uint256) {
        Property storage p = _properties[tokenId];
        if (p.maxSupply == 0) revert UnknownToken(tokenId);
        return p.maxSupply - totalSupply(tokenId);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        return _properties[tokenId].metadataURI;
    }

    // ---------- Transfer rules ----------

    /// @dev Applies to mint and transfer. Burning is not exposed by this contract.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
        whenNotPaused
    {
        if (from != address(0) && to != address(0)) {
            if (!isEligibleInvestor[from]) revert IneligibleInvestor(from);
            if (!isEligibleInvestor[to]) revert IneligibleInvestor(to);
            for (uint256 i = 0; i < ids.length; i++) {
                if (!_properties[ids[i]].transfersEnabled) revert TransfersDisabled(ids[i]);
            }
        }
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
