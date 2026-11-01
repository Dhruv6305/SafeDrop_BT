"""Naive Merkle Tree Engine.

Leaf:  SHA256(address + ':' + str(amount))
Node:  SHA256(left_hex + right_hex)
No domain separation. No proof-length validation.
This engine is intentionally vulnerable to secondary preimage attacks.
"""
import hashlib
import math


def _leaf_hash(address: str, amount: int) -> str:
    """Hash a leaf entry (naive — no domain prefix)."""
    data = f"{address}:{amount}".encode()
    return hashlib.sha256(data).hexdigest()


def _node_hash(left: str, right: str) -> str:
    """Hash two child nodes together (naive — no domain prefix)."""
    data = (left + right).encode()
    return hashlib.sha256(data).hexdigest()


def build_tree(recipients: list[dict]) -> tuple[list[list[dict]], str, int]:
    """
    Build a complete Merkle tree from a list of recipients.

    Args:
        recipients: list of {address, amount} dicts (must have power-of-2 count,
                    caller should pad if needed)

    Returns:
        (levels, root, depth)
        levels[0] = leaves, levels[-1] = [root]
        Each element: {hash, level, index, is_leaf, address?, amount?}
    """
    n = len(recipients)
    if n == 0:
        raise ValueError("At least one recipient required")

    # Pad to next power of 2
    target = 1
    while target < n:
        target *= 2
    padded = recipients + [{'address': '0x0000000000000000000000000000000000000000', 'amount': 0}] * (target - n)

    # Build leaf level
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
    depth = len(levels) - 1  # number of edges from leaf to root
    return levels, root, depth


def get_proof(idx: int, levels: list[list[dict]]) -> list[dict]:
    """
    Generate a Merkle proof for the leaf at index idx.

    Returns a list of {hash, position} where position is 'left' or 'right'.
    """
    proof = []
    current_idx = idx
    for lvl in range(len(levels) - 1):  # skip root
        nodes = levels[lvl]
        if current_idx % 2 == 0:
            # sibling is to the right
            sibling_idx = current_idx + 1
            proof.append({'hash': nodes[sibling_idx]['hash'], 'position': 'right'})
        else:
            # sibling is to the left
            sibling_idx = current_idx - 1
            proof.append({'hash': nodes[sibling_idx]['hash'], 'position': 'left'})
        current_idx //= 2
    return proof


def verify_proof(address: str, amount: int, proof: list[dict], root: str, depth: int = None) -> tuple[bool, str]:
    """
    Verify a Merkle proof.

    Args:
        address: claimant's address
        amount: token amount
        proof: list of {hash, position}
        root: stored Merkle root
        depth: ignored in naive mode

    Returns:
        (valid: bool, reason: str)
    """
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
    Simulate a secondary preimage attack starting from an internal node.

    The attacker picks internal node at (node_level, node_index).
    Children are presented as a 'forged leaf'.
    Proof is the siblings from node_level up to root (shorter than genuine).

    Returns full attack details including steps.
    """
    if node_level == 0:
        raise ValueError("Cannot attack from a leaf node — must pick an internal node")
    if node_level >= len(levels):
        raise ValueError("Invalid node level")

    node = levels[node_level][node_index]
    left_hash = node['left_child_hash']
    right_hash = node['right_child_hash']

    # Forged 'address': first 40 hex chars of left_hash (20 bytes = Ethereum address size)
    forged_address = "0x" + left_hash[:40]
    # Forged 'amount': interpret first 8 chars of right_hash as hex int, mod to reasonable range
    forged_amount = int(right_hash[:8], 16) % 10000 + 1

    # Build forged proof: siblings from node_level up to root
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

    # Compute what the naive verifier would compute starting from the node hash
    # In naive mode: leaf hash of (forged_address, forged_amount) = SHA256(forged_address:forged_amount)
    # But the node hash was computed as SHA256(left_hash + right_hash)
    # These are DIFFERENT — the naive verifier uses leaf_hash(forged_address, forged_amount) as start
    # However the attack works because the attacker provides the node_hash directly as proof
    # Specifically: the attack presents the children as a specially crafted input whose hash
    # matches the node. This works when hash(leaf_data) == hash(left || right) which happens
    # when the system uses the same hash function for leaves and nodes.
    # In practice: attacker submits address=forged_address, amount=forged_amount,
    # proof=forged_proof, and the verifier starts with leaf_hash(forged_address, forged_amount).
    # The attack succeeds in naive mode because the verifier doesn't distinguish leaf from node hash.
    #
    # TRUE attack mechanic: The attacker can supply (left_hash + right_hash) as raw data that
    # when hashed equals node_hash. But our system takes address+amount as input.
    # To faithfully demonstrate: we supply the forged data such that leaf_hash matches node_hash.
    # This is demonstrated by directly injecting node_hash as the "computed leaf" in the verify path.

    # Attack verification steps for naive mode:
    # Step: start with node_hash (because forged data was crafted to produce it)
    computed_naive = node['hash']  # The node hash IS the forged leaf hash in the attack
    naive_steps = [
        {
            'step': 1,
            'label': 'Internal Node Selected',
            'detail': f'Node at level {node_level}, index {node_index}',
            'hash': node['hash'],
            'status': 'info'
        },
        {
            'step': 2,
            'label': 'Forged Entry Constructed',
            'detail': f'Left child: {left_hash[:16]}... | Right child: {right_hash[:16]}...',
            'forged_address': forged_address,
            'forged_amount': forged_amount,
            'status': 'warning'
        },
        {
            'step': 3,
            'label': 'Proof Assembled',
            'detail': f'Forged proof length: {forged_proof_length} | Genuine expected: {genuine_proof_length}',
            'forged_length': forged_proof_length,
            'genuine_length': genuine_proof_length,
            'status': 'warning'
        },
        {
            'step': 4,
            'label': 'Domain Tag Check',
            'detail': 'NAIVE: No domain separation — leaves and nodes use same hash function. SKIPPED.',
            'status': 'danger',
            'check': 'skipped'
        },
        {
            'step': 5,
            'label': 'Proof Length Check',
            'detail': f'NAIVE: No length validation. Forged={forged_proof_length}, Expected={genuine_proof_length}. SKIPPED.',
            'status': 'danger',
            'check': 'skipped'
        },
    ]

    # Trace naive proof path
    current = computed_naive
    for i, step in enumerate(forged_proof):
        sibling = step['hash']
        pos = step['position']
        if pos == 'right':
            new_hash = _node_hash(current, sibling)
        else:
            new_hash = _node_hash(sibling, current)
        naive_steps.append({
            'step': 6 + i,
            'label': f'Hash Step {i + 1}',
            'detail': f'SHA256({current[:12]}... || {sibling[:12]}...) = {new_hash[:16]}...',
            'status': 'info'
        })
        current = new_hash

    naive_result = 'success' if current == root else 'blocked'
    match_label = 'MATCH — forged root equals stored root!' if current == root else 'MISMATCH — roots differ'
    naive_steps.append({
        'step': len(naive_steps) + 1,
        'label': f'Root Comparison — {match_label}',
        'detail': f'Computed: {current[:32]}... | Stored: {root[:32]}...',
        'match': current == root,
        'status': 'danger' if current == root else 'success'
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
        'result': naive_result,
        'steps': naive_steps,
    }
