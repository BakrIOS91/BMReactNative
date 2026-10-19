import Foundation
import IOSSecuritySuite
import React

@objc(BMRootJailbreakSniffer)
class BMRootJailbreakSniffer: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool { false }

  @objc func amICompromised(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(IOSSecuritySuite.amIJailbroken())
  }

  @objc func amIEmulator(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(IOSSecuritySuite.amIRunInEmulator())
  }

  @objc func amIDebugged(_ resolve: RCTPromiseResolveBlock, rejecter reject: RCTPromiseRejectBlock) {
    resolve(IOSSecuritySuite.amIDebugged())
  }
}
