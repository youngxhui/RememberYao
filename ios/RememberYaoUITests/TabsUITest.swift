//
//  TabsUITest.swift
//  RememberYaoUITests
//
//  Created by 曹华珠 on 2026-10-12.
//

import XCTest

/// 主界面 tab 栏：恰好 3 个标签，且每个都能点击进入对应首屏。
///
/// 两个刻意的取舍：
/// - 用 `-skipOnboarding` 启动参数直接进主界面（AppCoordinator 在 DEBUG 下认它），
///   省得每次测试都先点两下引导页；
/// - tab 标题走本地化，测试因此不绑定具体语种文案，改用「位置 + 选中态 + 各屏既有的
///   accessibilityIdentifier」判定，中途失败时能看出是哪个 tab、哪一屏出了问题。
final class TabsUITest: XCTestCase {

    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testTabs() throws {
        // UI tests must launch the application that they test.
        let app = XCUIApplication()
        app.launchArguments += ["-skipOnboarding"]
        app.launch()

        let tabBar = app.tabBars.firstMatch
        XCTAssertEqual(app.tabBars.count, 1, "主界面应只有一个 tab 栏")

        let tabs = tabBar.buttons
        XCTAssertEqual(tabs.count, 3, "tab 栏应有 3 个标签")

        // 顺序与 AppCoordinator.makeTabBarController 的入参一致：首页 → 药品 → 我的。
        // 每个 tab 取该屏 viewDidLoad 里无条件配置的那个控件做落地凭证：
        // 点得动 + 选中态翻转 + 目标屏的控件真的在，才算这个 tab 通。
        let markers = ["home-filter-button", "medica-add-button", "profile-add-person-button"]

        for index in 0..<markers.count {
            let tab = tabs.element(boundBy: index)
            XCTAssertTrue(tab.isHittable, "第 \(index) 个 tab 应可点击")
            tab.tap()
            XCTAssertTrue(tab.isSelected, "点击后第 \(index) 个 tab 应处于选中态")
            XCTAssertTrue(
                app.buttons[markers[index]].waitForExistence(timeout: 1),
                "点击第 \(index) 个 tab 后应进入对应首屏（\(markers[index])）"
            )
        }
    }

}
