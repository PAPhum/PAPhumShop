export interface ParsedDeviceInfo {
  isBot: boolean;
  deviceType: 'Mobile' | 'Tablet' | 'Desktop' | 'Bot';
  deviceModel: string;
  osName: string;
  browserName: string;
}

const BOT_PATTERN =
  /bot|crawler|spider|slurp|facebookexternalhit|facebot|line-poker|twitterbot|telegrambot|whatsapp|discordbot|googlebot|bingbot|yandex|baidu|duckduckbot|semrush|ahrefs|mj12bot|dotbot|petalbot|bytespider|gptbot|claudebot|curl|wget|python-requests|axios|postman|headlesschrome|lighthouse/i;

export function parseUserAgent(uaRaw: string | null | undefined): ParsedDeviceInfo {
  const ua = (uaRaw ?? '').trim();

  if (!ua || BOT_PATTERN.test(ua)) {
    return {
      isBot: true,
      deviceType: 'Bot',
      deviceModel: 'Bot / Crawler',
      osName: '-',
      browserName: '-',
    };
  }

  // 1. ตรวจจับเบราว์เซอร์ (รวม In-App Browser ของ Facebook / LINE / IG / TikTok)
  let browserName = 'Unknown';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) {
    browserName = 'Facebook App';
  } else if (/Line\//i.test(ua)) {
    browserName = 'LINE App';
  } else if (/Instagram/i.test(ua)) {
    browserName = 'Instagram App';
  } else if (/musical_ly|TikTok|BytedanceWebview/i.test(ua)) {
    browserName = 'TikTok App';
  } else if (/EdgA|EdgiOS|Edg\//i.test(ua)) {
    browserName = 'Edge';
  } else if (/OPR\/|Opera/i.test(ua)) {
    browserName = 'Opera';
  } else if (/SamsungBrowser/i.test(ua)) {
    browserName = 'Samsung Internet';
  } else if (/CriOS|Chrome\//i.test(ua) && !/Chromium/i.test(ua)) {
    browserName = 'Chrome';
  } else if (/FxiOS|Firefox\//i.test(ua)) {
    browserName = 'Firefox';
  } else if (/Safari\//i.test(ua) && /AppleWebKit/i.test(ua)) {
    browserName = 'Safari';
  }

  // 2. ตรวจจับระบบปฏิบัติการ + อุปกรณ์ / รุ่น
  let deviceType: ParsedDeviceInfo['deviceType'] = 'Desktop';
  let deviceModel = 'PC / Desktop';
  let osName = 'Unknown OS';

  if (/iPhone/i.test(ua)) {
    deviceType = 'Mobile';
    deviceModel = 'iPhone';
    const iosMatch = ua.match(/OS (\d+)[_.](\d+)/i);
    osName = iosMatch ? `iOS ${iosMatch[1]}.${iosMatch[2]}` : 'iOS';
  } else if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))) {
    deviceType = 'Tablet';
    deviceModel = 'iPad';
    const iosMatch = ua.match(/OS (\d+)[_.](\d+)/i);
    osName = iosMatch ? `iPadOS ${iosMatch[1]}.${iosMatch[2]}` : 'iPadOS';
  } else if (/Android/i.test(ua)) {
    const androidMatch = ua.match(/Android\s+([0-9.]+)/i);
    osName = androidMatch ? `Android ${androidMatch[1]}` : 'Android';
    deviceType = /Mobile/i.test(ua) ? 'Mobile' : 'Tablet';

    // ดึงรหัสรุ่นเครื่อง Android จากวงเล็บใน UA เช่น (Linux; Android 14; SM-S918B Build/...)
    const modelMatch = ua.match(/Android\s+[0-9.]+;\s*([^;)]+?)(?:\s+Build\/|\))/i);
    const rawModel = modelMatch?.[1]?.trim();
    if (rawModel && rawModel.toLowerCase() !== 'k') {
      deviceModel = rawModel;
    } else {
      deviceModel = deviceType === 'Tablet' ? 'Android Tablet' : 'Android Phone';
    }
  } else if (/Windows NT/i.test(ua)) {
    deviceType = 'Desktop';
    deviceModel = 'Windows PC';
    if (/Windows NT 10\.0/i.test(ua)) osName = 'Windows 10/11';
    else if (/Windows NT 6\.3/i.test(ua)) osName = 'Windows 8.1';
    else osName = 'Windows';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    deviceType = 'Desktop';
    deviceModel = 'Mac';
    const macMatch = ua.match(/Mac OS X (\d+)[_.](\d+)/i);
    osName = macMatch ? `macOS ${macMatch[1]}.${macMatch[2]}` : 'macOS';
  } else if (/Linux/i.test(ua)) {
    deviceType = 'Desktop';
    deviceModel = 'Linux PC';
    osName = 'Linux';
  }

  return {
    isBot: false,
    deviceType,
    deviceModel,
    osName,
    browserName,
  };
}