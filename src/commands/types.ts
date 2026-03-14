import { ConfigService } from '../services/config-service';
import { SessionManager } from '../services/session-manager';
import { SoundConfigService } from '../services/sound-config-service';
import { SoundLibrary } from '../services/sound-library';

export interface CommandDependencies {
  readonly configService: ConfigService;
  readonly sessionManager: SessionManager;
  readonly soundConfigService: SoundConfigService;
  readonly soundLibrary: SoundLibrary;
  readonly startedAt: Date;
}
