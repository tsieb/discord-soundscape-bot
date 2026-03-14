import { ConfigService } from '../services/config-service';
import { DensityCurveService } from '../services/density-curve-service';
import { SessionManager } from '../services/session-manager';
import { SoundConfigService } from '../services/sound-config-service';
import { SoundLibrary } from '../services/sound-library';

export interface DashboardServices {
  configService: ConfigService;
  densityCurveService: DensityCurveService;
  sessionManager: SessionManager;
  soundConfigService: SoundConfigService;
  soundLibrary: SoundLibrary;
}
