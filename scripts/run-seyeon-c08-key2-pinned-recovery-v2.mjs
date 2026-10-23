/** One-time KEY2 recovery; shares the audited bounded six-call runner. */
import {pathToFileURL} from 'node:url';
import {runSeyeonC08Key2RealSixV1} from './run-seyeon-c08-key2-first-six-real-v1.mjs';
import {admitSeyeonC08Key2PinnedGithubV2} from './seyeon-c08-key2-pinned-recovery-admission-v2.mjs';
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 await runSeyeonC08Key2RealSixV1(admitSeyeonC08Key2PinnedGithubV2);
