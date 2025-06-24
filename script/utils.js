import { createHash } from 'node:crypto';

// port of https://github.com/ethereum/go-ethereum/blob/master/beacon/merkle/merkle.go
export function verifyProof(root, index, proof, value) {
    let buf = value;

    proof.forEach((p) => {
        const hasher = createHash('sha256');
        if (index % 2n == 0n) {
            hasher.update(buf);
            hasher.update(p);
        } else {
            hasher.update(p);
            hasher.update(buf);
        }
        buf = hasher.digest();
        console.log('-> ', toHex(buf));
        index >>= 1n;
        if (index == 0n) {
            throw new Error('branch has extra item');
        }
    });

    console.log('    ^^^ root');

    if (index != 1n) {
        throw new Error('branch is missing items');
    }

    if (toHex(root) != toHex(buf)) {
        throw new Error('proof is not valid');
    }

    console.log('proof ok!');
    console.log('<-');
}

export function toHex(t) {
    return '0x' + Buffer.from(t).toString('hex');
}

export function log2(n) {
    return Math.ceil(Math.log2(Number(n))) || 1;
}

// this is toGindex in Lodestar
// https://github.com/ChainSafe/ssz/blob/1a34fe845165b125007958f75f159872b561b7dd/packages/persistent-merkle-tree/src/gindex.ts#L8
export function genIndex(height, index) {
    // 2 ^ tree height + node index
    return (1 << height) | index;
}

export function concatProof(proof) {
    const witnessLength = proof.witnesses.length;
    const witnessBytes = new Uint8Array(witnessLength * 32);
    for (let i = 0; i < witnessLength; i++) {
        witnessBytes.set(proof.witnesses[i], i * 32);
    }
    return witnessBytes;
}
