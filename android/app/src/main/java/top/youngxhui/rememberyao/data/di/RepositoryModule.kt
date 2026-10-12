package top.youngxhui.rememberyao.data.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import top.youngxhui.rememberyao.core.domain.Repository
import top.youngxhui.rememberyao.data.repository.Store

/**
 * Repository 接口 → Store 实现。
 *
 * 屏幕与 ViewModel 只依赖 [Repository]；Hilt 的构造器注入只会绑定具体类型
 * [Store]，不自动绑到它实现的接口上，所以这里显式 @Binds。
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class RepositoryModule {

    @Binds
    @Singleton
    abstract fun bindRepository(store: Store): Repository
}
