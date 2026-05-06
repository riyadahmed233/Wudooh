import {
    arabicRegex,
    CustomFont,
    CustomSetting,
    DefaultWudoohStorage,
    hasArabicScript,
    injectBuiltInFont,
    injectCustomFonts,
    isNodeEditable,
    Message,
    MessageReasons,
    onDOMContentLoaded,
    runtime,
    sync,
    wait,
    WudoohKeys,
    WudoohStorage
} from "./common"
import {extensions} from "./extensions"

extensions()

/** The observer used in startObserver to dynamically update newly added Nodes. */
let observer: MutationObserver | null = null

function hasNodeBeenUpdated(node: Node): boolean {
    return !!node.parentElement && node.parentElement.getAttribute("wudooh") === "true"
}

function hasDocumentBeenUpdated(): boolean {
    return document.getElementById("wudoohMetaElement") !== null
}

function getArabicTextNodesIn(rootNode: Node): Array<Node> {
    const treeWalker: TreeWalker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT)
    const arabicTextNodes: Array<Node> = []

    let node: Node | null = treeWalker.nextNode()
    while (!!node) {
        if (hasArabicScript(node)) arabicTextNodes.push(node)
        node = treeWalker.nextNode()
    }
    return arabicTextNodes
}

async function updateNode(node: Node, textSize: number, lineHeight: number, font: string): Promise<void> {
    if (!node.nodeValue) return

    const newSize: number = textSize / 100
    const newHeight: number = lineHeight / 100

    if (hasNodeBeenUpdated(node)) await updateByChanging(node, newSize, newHeight, font)
    else await updateByAdding(node, newSize, newHeight, font)
}

async function updateByAdding(node: Node, textSize: number, lineHeight: number, font: string): Promise<void> {
    const parent: Node | null = node.parentNode
    if (!parent) return
    if (isNodeEditable(parent) || isNodeEditable(node)) return

    let newHTML: string
    if (font === "Original") {
        newHTML = "<span wudooh='true' style='" +
            "font-size:" + textSize + "em;" +
            "line-height:" + lineHeight + "em;" +
            "'>$&</span>"
    } else {
        newHTML = "<span wudooh='true' style='" +
            "font-size:" + textSize + "em;" +
            "line-height:" + lineHeight + "em;" +
            "font-family:" + "\"" + font + "\";" +
            "'>$&</span>"
    }

    const text: string = node.nodeValue!.replace(arabicRegex, newHTML)
    const nextSibling: ChildNode | null = node.nextSibling
    const newElement: HTMLDivElement = document.createElement("div")
    newElement.innerHTML = text

    while (newElement.firstChild) {
        parent.insertBefore(newElement.firstChild, nextSibling)
    }
    parent.removeChild(node)
}

async function updateByChanging(node: Node, textSize: number, lineHeight: number, font: string): Promise<void> {
    if (!node.parentElement) return

    node.parentElement.style.fontSize = textSize + "em"
    node.parentElement.style.lineHeight = lineHeight + "em"
    if (font === "Original") node.parentElement.style.fontFamily = ""
    else node.parentElement.style.fontFamily = font
}

async function updateAll(textSize: number, lineHeight: number, font: string): Promise<void> {
    await Promise.all(getArabicTextNodesIn(document.body).map((node: Node) => updateNode(node, textSize, lineHeight, font)))
}

async function startObserver(textSize: number, lineHeight: number, font: string): Promise<void> {
    if (!!observer) {
        observer.disconnect()
        observer = null
    }

    const config: MutationObserverInit = {
        attributes: false,
        attributeOldValue: false,
        characterData: true,
        characterDataOldValue: true,
        childList: true,
        subtree: true
    }

    const callback: MutationCallback = (mutationsList: Array<MutationRecord>): void => {
        mutationsList.forEach((record: MutationRecord): void => {
            record.addedNodes.forEach((addedNode: Node): void => {
                getArabicTextNodesIn(addedNode).forEach((arabicNode: Node): void => {
                    updateNode(arabicNode, textSize, lineHeight, font)
                })
            })

            if (record.target.nodeValue !== record.oldValue && record.target.parentNode instanceof Node) {
                getArabicTextNodesIn(record.target.parentNode).forEach((arabicNode: Node): void => {
                    updateNode(arabicNode, textSize, lineHeight, font)
                })
            }
        })
    }

    observer = new MutationObserver(callback)
    observer.observe(document.body, config)
}

async function notifyDocumentHasUpdated(): Promise<void> {
    if (!hasDocumentBeenUpdated()) {
        const meta: HTMLMetaElement = document.createElement("meta")
        meta.id = "wudoohMetaElement"
        meta.setAttribute("wudooh", "true")
        document.head.appendChild(meta)
    }
}

async function toggleOff(): Promise<void> {
    if (!!observer) {
        observer.disconnect()
        observer = null
    }
    getArabicTextNodesIn(document.body).forEach((node: Node): void => {
        if (!!node.parentElement) {
            node.parentElement.style.fontSize = ""
            node.parentElement.style.lineHeight = ""
            node.parentElement.style.fontFamily = ""
        }
    })
}

async function addMessageListener(): Promise<void> {
    runtime.onMessage.addListener((message: Message): void => {
        switch (message.reason) {
            case MessageReasons.updateAllText:
                main()
                break
            case MessageReasons.injectCustomFonts:
                injectCustomFonts(message.data)
                break
            case MessageReasons.toggleOff:
                toggleOff()
                break
        }
    })
}

async function main(): Promise<void> {
    if (!document.body) return

    const storage: WudoohStorage = {
        ...DefaultWudoohStorage,
        ...(await sync.get(WudoohKeys.all()))
    }
    let textSize: number = storage.textSize!
    let lineHeight: number = storage.lineHeight!
    let font: string = storage.font!
    const isOn: boolean = storage.onOff!
    const whitelisted: Array<string> = storage.whitelisted!
    const customSettings: Array<CustomSetting> = storage.customSettings!
    const customFonts: Array<CustomFont> = storage.customFonts!

    const thisURL: string = new URL(document.URL).hostname
    const isWhitelisted: boolean = !!whitelisted.find((it: string): boolean => it === thisURL)
    const customSite: CustomSetting | undefined = customSettings.find((custom: CustomSetting): boolean => custom.url === thisURL)

    if (isOn && !isWhitelisted) {
        injectCustomFonts(customFonts)
        if (!!customSite) {
            textSize = customSite.textSize
            lineHeight = customSite.lineHeight
            font = customSite.font
        }

        await injectBuiltInFont(font)
        await updateAll(textSize, lineHeight, font)
        onDOMContentLoaded(() => wait(1000, () => updateAll(textSize, lineHeight, font)))
        wait(1000, () => updateAll(textSize, lineHeight, font))
        await startObserver(textSize, lineHeight, font)
        await notifyDocumentHasUpdated()
    }

    if (hasDocumentBeenUpdated() && (!isOn || isWhitelisted)) {
        await toggleOff()
    }
}

main()
addMessageListener()
