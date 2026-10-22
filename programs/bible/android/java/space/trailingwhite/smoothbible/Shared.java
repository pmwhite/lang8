package space.trailingwhite.smoothbible;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

// What the app shares as a file (a card's image), from its cache's shared/
// folder, to the app it is shared with: read only, by the permission the
// share gives (content://space.trailingwhite.smoothbible.shared/NAME).
public final class Shared extends ContentProvider {
  static final String AUTHORITY = "space.trailingwhite.smoothbible.shared";

  static File dir(android.content.Context c) {
    File d = new File(c.getCacheDir(), "shared");
    d.mkdirs();
    return d;
  }

  static Uri uri(String name) {
    return Uri.parse("content://" + AUTHORITY + "/" + Uri.encode(name));
  }

  private File file(Uri uri) throws FileNotFoundException {
    String name = uri.getLastPathSegment();
    if (name == null || name.contains("/") || name.startsWith(".")) throw new FileNotFoundException();
    File f = new File(dir(getContext()), name);
    if (!f.isFile()) throw new FileNotFoundException();
    return f;
  }

  @Override
  public boolean onCreate() {
    return true;
  }

  @Override
  public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    return ParcelFileDescriptor.open(file(uri), ParcelFileDescriptor.MODE_READ_ONLY);
  }

  @Override
  public String getType(Uri uri) {
    String n = uri.getLastPathSegment();
    return n != null && n.endsWith(".png") ? "image/png" : "text/plain";
  }

  @Override
  public Cursor query(Uri uri, String[] projection, String sel, String[] args, String order) {
    File f;
    try {
      f = file(uri);
    } catch (FileNotFoundException e) {
      return null;
    }
    MatrixCursor c = new MatrixCursor(new String[] {OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE});
    c.addRow(new Object[] {f.getName(), f.length()});
    return c;
  }

  @Override
  public Uri insert(Uri uri, ContentValues v) {
    return null;
  }

  @Override
  public int delete(Uri uri, String sel, String[] args) {
    return 0;
  }

  @Override
  public int update(Uri uri, ContentValues v, String sel, String[] args) {
    return 0;
  }
}
