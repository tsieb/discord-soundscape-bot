import { ConfigService } from '../services/config-service';
import { SessionManager } from '../services/session-manager';
import { SoundLibrary } from '../services/sound-library';

export interface CommandDependencies {
  readonly configService: ConfigService;
  readonly sessionManager: SessionManager;
  readonly soundLibrary: SoundLibrary;
  readonly startedAt: Date;
}
