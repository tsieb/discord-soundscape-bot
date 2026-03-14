import { ConfigService } from '../services/config-service';
import { DensityCurveService } from '../services/density-curve-service';
import { SessionManager } from '../services/session-manager';
import { SoundConfigService } from '../services/sound-config-service';
import { SoundLibrary } from '../services/sound-library';

export interface CommandDependencies {
  readonly configService: ConfigService;
  readonly densityCurveService: DensityCurveService;
  readonly sessionManager: SessionManager;
  readonly soundConfigService: SoundConfigService;
  readonly soundLibrary: SoundLibrary;
  readonly startedAt: Date;
}
