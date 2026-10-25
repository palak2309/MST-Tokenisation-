// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title PropertyDocumentRegistry
/// @notice Records only a property identifier, a document SHA-256 fingerprint, a timestamp and the submitter.
///         Never store document contents or personal data on-chain.
contract PropertyDocumentRegistry {
    struct Record {
        address submitter;
        uint256 timestamp;
    }

    mapping(bytes32 => Record) private records; // key = keccak256(propertyId, docHash)

    event DocumentRegistered(string propertyId, bytes32 indexed docHash, address indexed submitter, uint256 timestamp);

    function registerDocument(string calldata propertyId, bytes32 docHash) external {
        require(bytes(propertyId).length > 0 && bytes(propertyId).length <= 64, "invalid propertyId");
        require(docHash != bytes32(0), "invalid hash");
        bytes32 key = keccak256(abi.encode(propertyId, docHash));
        require(records[key].timestamp == 0, "already registered");
        records[key] = Record(msg.sender, block.timestamp);
        emit DocumentRegistered(propertyId, docHash, msg.sender, block.timestamp);
    }

    function getRecord(string calldata propertyId, bytes32 docHash) external view returns (address submitter, uint256 timestamp) {
        Record memory r = records[keccak256(abi.encode(propertyId, docHash))];
        return (r.submitter, r.timestamp);
    }
}
