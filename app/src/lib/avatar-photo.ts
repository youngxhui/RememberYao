import { Directory, File, Paths } from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

/**
 * 头像照片的文件层：选图 → 裁成正方形 → 缩到统一边长 → 存进沙盒。
 *
 * 为什么必须自己落一份文件：`expo-image-picker` 返回的是相册 / 临时目录里的
 * URI（Android 还带 `content://`），系统随时可能回收，也不能跨重启稳定引用。
 * `expo-file-system` 的 document 目录才会跟着 App 活。
 *
 * 为什么先裁后缩：`allowsEditing` 在部分平台被忽略，拿回来的图不一定是方的；
 * 而各处头像（含导航栏图标）都按 1:1 渲染，非方图会被 `contentFit="cover"`
 * 裁掉一侧。裁切在缩放之后做，保证裁的就是最终像素。
 */

/** 头像边长：导航栏图标 ~28pt、各屏最大 64pt，256² 够用又不至于一张图占几 MB */
const AVATAR_SIZE = 256;

/** 头像照片放在 document 目录的 avatars/ 下（cache 会被系统回收，照片不能住那儿） */
const AVATAR_DIR_NAME = "avatars";

export type AvatarPickResult =
  | { status: "picked"; uri: string }
  /** 用户关了相册：正常路径，不算失败 */
  | { status: "cancelled" }
  /** 没给相册权限：调用方要提示，否则用户以为按钮坏了 */
  | { status: "denied" };

/** 头像目录，不存在就建（每次调用都确保，忽略已存在） */
function avatarDirectory(): Directory {
  // 必须用构造函数而不是 `Paths.document.createDirectory(name)`：后者会真的
  // 建目录，且目录已存在时抛 FileAlreadyExistsException（第二次选图就炸，
  // 而 avatars/ 是文件、不随删库重建消失）。构造函数只拼路径、不碰磁盘，
  // 建不建交给下面的 exists 判断。
  const dir = new Directory(Paths.document, AVATAR_DIR_NAME);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * 选一张头像照片，返回可直接存进 `persons.avatar_uri` 的本地 URI。
 * 权限被拒 / 用户取消都不抛错，用 status 区分；其余失败原样抛出，由调用方
 * 提示「重试」—— 但先把真实原因打进控制台，否则现场只剩一句「失败」。
 */
export async function pickAvatarPhoto(): Promise<AvatarPickResult> {
  try {
    return await pickAvatarPhotoUnsafe();
  } catch (error) {
    console.warn("选择头像照片失败", error);
    throw error;
  }
}

async function pickAvatarPhotoUnsafe(): Promise<AvatarPickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { status: "denied" };

  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    // 系统编辑器先按 1:1 裁一轮：多数平台用户已经裁好，下面只做兜底
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.9,
  });
  if (picked.canceled) return { status: "cancelled" };
  const asset = picked.assets[0];
  if (!asset) return { status: "cancelled" };

  // 先按长边缩到目标尺寸（只给一边，另一边按比例算，不变形）
  const resized = await ImageManipulator.manipulateAsync(asset.uri, [
    { resize: { width: AVATAR_SIZE } },
  ]);
  // 再居中裁成正方形：兜住 ignores allowsEditing 的平台与非方图
  const side = Math.min(resized.width, resized.height);
  const cropped = await ImageManipulator.manipulateAsync(resized.uri, [
    {
      crop: {
        originX: Math.round((resized.width - side) / 2),
        originY: Math.round((resized.height - side) / 2),
        width: side,
        height: side,
      },
    },
  ]);

  // 用构造函数拼路径，不要用 `dir.createFile(name, mimeType)`：后者会真的在
  // 磁盘上建一个空文件，紧接着 move 往这个已存在的路径上搬，必然报
  // "an item with the same name already exists"
  const file = new File(
    avatarDirectory(),
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.jpg`,
  );
  // move 而不是 copy：manipulateAsync 的产物本就在临时目录里，没必要留两份
  await new File(cropped.uri).move(file);
  return { status: "picked", uri: file.uri };
}

/**
 * 删掉一张头像照片。文件本来就可能已经不在了（被用户清过沙盒、换图时删过），
 * 所以失败只吞掉 —— 头像显示层对读不到的图有兜底，不该让删除成员整笔失败。
 */
export async function deleteAvatarPhoto(uri: string): Promise<void> {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // 见上：文件消失不是错误
  }
}
