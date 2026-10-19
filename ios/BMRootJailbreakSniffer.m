#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (BMRootJailbreakSniffer, NSObject)

RCT_EXTERN_METHOD(amICompromised : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(amIEmulator : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)
RCT_EXTERN_METHOD(amIDebugged : (RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

@end
