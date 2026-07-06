export interface VoteTally {
  ejected: string | null;
  wasTie: boolean;
  voteCounts: Map<string, number>;
}

export function tallyVotes(votes: Map<string, string | "skip">): VoteTally {
  const counts = new Map<string, number>();
  for (const target of votes.values()) {
    counts.set(target, (counts.get(target) || 0) + 1);
  }

  let maxVotes = 0;
  let winners: string[] = [];
  for (const [target, count] of counts) {
    if (count > maxVotes) {
      maxVotes = count;
      winners = [target];
    } else if (count === maxVotes) {
      winners.push(target);
    }
  }

  if (maxVotes === 0) {
    return { ejected: null, wasTie: false, voteCounts: counts };
  }
  if (winners.length === 1 && winners[0] !== "skip") {
    return { ejected: winners[0], wasTie: false, voteCounts: counts };
  }
  return { ejected: null, wasTie: winners.length > 1, voteCounts: counts };
}
