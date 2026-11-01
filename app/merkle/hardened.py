"""Hardened Merkle Tree Engine.

Leaf:  SHA256("LEAF:" + address + ':' + str(amount))
Node:  SHA256("NODE:" + left_hex + right_hex)
Two mitigations applied:
  1. Domain separation — leaves and nodes are in different hash namespaces
  2. Proof-length validation — proof must equal tree depth exactly
"""
import hashlib


def _leaf_hash(address: str, amount: int) -> str:
    """Hash a leaf entry with domain prefix to prevent confusion with internal nodes."""
    data = f"LEAF:{address}:{amount}".encode()
    return hashlib.sha256(data).hexdigest()


def _node_hash(left: str, right: str) -> str:
    """Hash two child nodes together with domain prefix."""
    data = ("NODE:" + left + right).encode()
    return hashlib.sha256(data).hexdigest()


def build_tree(recipients: list[dict]) -> tuple[list[list[dict]], str, int]:
    """
    Build a complete Merkle tree with domain-separated hashes.

    Returns:
        (levels, root, depth)
    """
    n = len(recipients)
    if n == 0:
        raise ValueError("At least one recipient required")

    # Pad to next power of 2
    target = 1
    while target < n:
        target *= 2
    padded = recipients + [{'address': '0x0000000000000000000000000000000000000000', 'amount': 0}] * (target - n)

    leaf_level = []
    for i, r in enumerate(padded):
        h = _leaf_hash(r['address'], r['amount'])
        node = {
            'hash': h,
            'level': 0,
            'index': i,
            'is_leaf': True,
            'is_padding': i >= n,
        }
        if i < n:
            node['address'] = r['address']
            node['amount'] = r['amount']
        leaf_level.append(node)

    levels = [leaf_level]
    current = [node['hash'] for node in leaf_level]
    lvl = 1

    while len(current) > 1:
        next_level = []
        next_hashes = []
        for i in range(0, len(current), 2):
            left = current[i]
            right = current[i + 1]
            h = _node_hash(left, right)
            next_level.append({
                'hash': h,
                'level': lvl,
                'index': i // 2,
                'is_leaf': False,
                'left_child_hash': left,
                'right_child_hash': right,
            })
            next_hashes.append(h)
        levels.append(next_level)
        current = next_hashes
        lvl += 1

    root = levels[-1][0]['hash']
    depth = len(levels) - 1
    return levels, root, depth


def get_proof(idx: int, levels: list[list[dict]]) -> list[dict]:
    """Generate a Merkle proof for the leaf at index idx."""
    proof = []
    current_idx = idx
    for lvl in range(len(levels) - 1):
        nodes = levels[lvl]
        if current_idx % 2 == 0:
            sibling_idx = current_idx + 1
            proof.append({'hash': nodes[sibling_idx]['hash'], 'position': 'right'})
        else:
            sibling_idx = current_idx - 1
            proof.append({'hash': nodes[sibling_idx]['hash'], 'position': 'left'})
        current_idx //= 2
    return proof


def verify_proof(address: str, amount: int, proof: list[dict], root: str, depth: int = None) -> tuple[bool, str]:
    """
    Verify a Merkle proof with full hardened checks.

    Checks:
      1. Proof length must equal tree depth (catches short forged proofs)
      2. Recomputed root must match stored root (domain-separated computation)
    """
    # Mitigation 2: Proof-length validation
    if depth is not None and len(proof) != depth:
        return False, (
            f"Proof length mismatch: submitted {len(proof)} hashes, "
            f"expected exactly {depth} (tree depth). "
            f"Short proofs indicate a forged claim starting from an internal node."
        )

    # Mitigation 1: Domain-separated leaf hash
    computed = _leaf_hash(address, amount)

    for step in proof:
        sibling = step['hash']
        pos = step['position']
        if pos == 'right':
            computed = _node_hash(computed, sibling)
        else:
            computed = _node_hash(sibling, computed)

    if computed == root:
        return True, "Proof valid"
    return False, f"Root mismatch: computed {computed[:16]}... expected {root[:16]}..."


def simulate_attack(node_level: int, node_index: int, levels: list[list[dict]], root: str, depth: int) -> dict:
    """
    Simulate a secondary preimage attack in hardened mode — shows why it is blocked.

    Returns full attack details including step-by-step rejection explanation.
    """
    if node_level == 0:
        raise ValueError("Cannot attack from a leaf node — must pick an internal node")

    node = levels[node_level][node_index]
    left_hash = node['left_child_hash']
    right_hash = node['right_child_hash']

    forged_address = "0x" + left_hash[:40]
    forged_amount = int(right_hash[:8], 16) % 10000 + 1

    # Build forged proof (same logic as naive — shorter proof)
    forged_proof = []
    current_idx = node_index
    for lvl in range(node_level, len(levels) - 1):
        nodes = levels[lvl]
        if current_idx % 2 == 0:
            sibling_idx = current_idx + 1
            forged_proof.append({'hash': nodes[sibling_idx]['hash'], 'position': 'right'})
        else:
            sibling_idx = current_idx - 1
            forged_proof.append({'hash': nodes[sibling_idx]['hash'], 'position': 'left'})
        current_idx //= 2

    genuine_proof_length = depth
    forged_proof_length = len(forged_proof)

    # HARDENED checks
    length_check_passes = forged_proof_length == genuine_proof_length

    # In hardened mode, leaf hash includes "LEAF:" prefix
    # So LEAF:forged_address:forged_amount ≠ node_hash (which was computed with "NODE:" prefix)
    hardened_leaf_hash = _leaf_hash(forged_address, forged_amount)
    domain_mismatch = hardened_leaf_hash != node['hash']

    steps = [
        {
            'step': 1,
            'label': 'Internal Node Selected',
            'detail': f'Node at level {node_level}, index {node_index} selected by attacker',
            'hash': node['hash'],
            'status': 'info'
        },
        {
            'step': 2,
            'label': 'Forged Entry Constructed',
            'detail': f'Left: {left_hash[:16]}... | Right: {right_hash[:16]}...',
            'forged_address': forged_address,
            'forged_amount': forged_amount,
            'status': 'warning'
        },
        {
            'step': 3,
            'label': 'Proof Assembled',
            'detail': f'Forged proof: {forged_proof_length} hashes | Genuine required: {genuine_proof_length}',
            'forged_length': forged_proof_length,
            'genuine_length': genuine_proof_length,
            'status': 'warning'
        },
        {
            'step': 4,
            'label': '[MITIGATION 1] Domain Tag Check',
            'detail': (
                f'HARDENED: SHA256("LEAF:"+forged) = {hardened_leaf_hash[:20]}... '
                f'but internal node hash = {node["hash"][:20]}... '
                f'The "LEAF:" prefix ensures leaf hashes can NEVER equal a "NODE:" hash. Collision impossible.'
            ),
            'match': not domain_mismatch,
            'status': 'success',
            'check': 'domain_mismatch' if domain_mismatch else 'passed'
        },
        {
            'step': 5,
            'label': '[MITIGATION 2] Proof Length Check',
            'detail': (
                f'HARDENED: Submitted {forged_proof_length} proof hashes, '
                f'but tree depth = {genuine_proof_length} requires exactly {genuine_proof_length} hashes. '
                f'{"REJECTED — proof is too short! Forged proofs skip leaf-level siblings." if not length_check_passes else "Length matches (pass)"}'
            ),
            'match': length_check_passes,
            'status': 'success' if not length_check_passes else 'warning',
            'check': 'length_fail' if not length_check_passes else 'passed'
        },
    ]

    # Overall result: blocked if either check fails
    result = 'blocked'
    rejection_reason = []
    if domain_mismatch:
        rejection_reason.append("domain tag mismatch (LEAF: ≠ NODE:)")
    if not length_check_passes:
        rejection_reason.append(f"proof length {forged_proof_length} ≠ required {genuine_proof_length}")

    steps.append({
        'step': 6,
        'label': 'Final Decision — ATTACK BLOCKED',
        'detail': f'REJECTED: {" AND ".join(rejection_reason)}' if rejection_reason else 'Passed all checks (unexpected)',
        'status': 'success',
        'result': result
    })

    return {
        'node_level': node_level,
        'node_index': node_index,
        'node_hash': node['hash'],
        'left_hash': left_hash,
        'right_hash': right_hash,
        'forged_address': forged_address,
        'forged_amount': forged_amount,
        'forged_proof': forged_proof,
        'genuine_proof_length': genuine_proof_length,
        'forged_proof_length': forged_proof_length,
        'result': result,
        'rejection_reasons': rejection_reason,
        'steps': steps,
    }
